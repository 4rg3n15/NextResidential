import { Inject, Injectable } from '@nestjs/common';
import {
  RELOJ,
  avisoDeOcupantes,
  decidirDeclaracion,
  esMotivoDePermiso,
  formatearCodigoDeOcupante,
} from '@ncr/domain-core';
import type { ErrorDominio, MotivoDeNoDeclarar, Reloj, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import {
  BITACORA_DE_RESIDENTES,
  CODIGOS_DE_OCUPANTE,
  OCUPANTES_DE_LA_VIVIENDA,
} from './puertos-hogar';
import type {
  BitacoraDeResidentes,
  CodigosDeOcupante,
  OcupantesDeLaVivienda,
  PlazaDeOcupante,
} from './puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * OCUPANTES · DECLARAR, CONSULTAR Y COMPARTIR (D6, 3.3, ADR-025) · RONDA 15-W
 *
 * El residente ve los códigos de las plazas LIBRES —con el prefijo de su
 * conjunto, `MIRA-K7PQ-2XWZ`, para compartirlos (D2)— y el nombre de quien
 * ocupa las demás, con cuenta o sin ella (un menor, D-W2). El código de una
 * plaza ocupada ya no sirve para nada y no se muestra.
 *
 * Declarar es del titular y una sola vez, de 1 hasta el tope de su vivienda;
 * desde la 15-W ya NO es definitivo: después añade y retira plazas libres
 * (`plazas-del-titular.ts`). Otro intento de declarar es un rechazo de PERMISO.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface PlazaVisible {
  readonly id: string;
  readonly numero: number;
  readonly libre: boolean;
  /** Sólo en las libres: «MIRA-ABCD-EFGH». */
  readonly codigo: string | null;
  readonly ocupante: string | null;
  /** 15-W · la ocupa una persona SIN cuenta (un menor del hogar). */
  readonly sinCuenta: boolean;
}

export interface MisOcupantes {
  readonly declarados: number;
  readonly declarada: boolean;
  readonly plazas: readonly PlazaVisible[];
  readonly aviso: string;
  /** 15-W (D-W10) · el tope de la vivienda, contando al titular: «3 de 4». */
  readonly tope: number;
  /** 15-W · quien pregunta es el titular: sólo él añade y retira plazas. */
  readonly esTitular: boolean;
}

export type ResultadoDeDeclaracion =
  | { readonly declarada: true; readonly ocupantes: MisOcupantes }
  | {
      readonly declarada: false;
      readonly motivo: MotivoDeNoDeclarar;
      /** Rechazo de permiso (403), no de forma (400). */
      readonly dePermiso: boolean;
    };

export const plazasVisibles = (
  codigos: CodigosDeOcupante,
  copropiedadId: string,
  plazas: readonly PlazaDeOcupante[],
  prefijo: string | null,
): PlazaVisible[] =>
  plazas.map((p) => {
    const libre = p.usuarioId === null && (p.personaId ?? null) === null;
    return {
      id: p.id,
      numero: p.numero,
      libre,
      codigo: libre
        ? formatearCodigoDeOcupante(codigos.codigoDe(copropiedadId, p.id, p.generacion), prefijo)
        : null,
      ocupante: p.ocupante,
      sinCuenta: (p.personaId ?? null) !== null,
    };
  });

@Injectable()
export class VerMisOcupantes {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(OCUPANTES_DE_LA_VIVIENDA) private readonly ocupantes: OcupantesDeLaVivienda,
    @Inject(CODIGOS_DE_OCUPANTE) private readonly codigos: CodigosDeOcupante,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<Resultado<MisOcupantes, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { viviendaId } = r.valor.ambito;
    const plazas = await this.ocupantes.plazas(copropiedadId, viviendaId);
    const d = await this.ocupantes.declaracion(copropiedadId, viviendaId, ctx.usuarioId);
    return {
      ok: true,
      valor: {
        declarados: plazas.length,
        declarada: d.declarada,
        plazas: plazasVisibles(this.codigos, copropiedadId, plazas, d.codigoCorto),
        aviso: avisoDeOcupantes(d.tope),
        tope: d.tope,
        esTitular: d.esPrimerResidente,
      },
    };
  }
}

@Injectable()
export class DeclararMisOcupantes {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(OCUPANTES_DE_LA_VIVIENDA) private readonly ocupantes: OcupantesDeLaVivienda,
    private readonly ver: VerMisOcupantes,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    pedido: { readonly numero: number },
  ): Promise<Resultado<ResultadoDeDeclaracion, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { viviendaId } = r.valor.ambito;
    const d = await this.ocupantes.declaracion(copropiedadId, viviendaId, ctx.usuarioId);
    const decision = decidirDeclaracion({
      numero: pedido.numero,
      esPrimerResidente: d.esPrimerResidente,
      yaDeclarada: d.declarada,
      tope: d.tope,
    });
    if (!decision.ok) return this.rechazo(decision.error);
    // Dos declaraciones simultáneas: la base (plazas_numero_uk) deja pasar una.
    const hecha = await this.ocupantes.declarar(
      copropiedadId,
      viviendaId,
      ctx.usuarioId,
      decision.valor,
    );
    if (!hecha) return this.rechazo('YA_DECLARADA');
    await this.bitacora.anotar({
      copropiedadId,
      tipo: 'ocupantes_declarados',
      ocurridoEn: this.reloj.ahora(),
      usuarioId: ctx.usuarioId,
      actorId: ctx.usuarioId,
      viviendaId,
      detalle: `ocupantes: ${String(decision.valor)}`,
    });
    const vistos = await this.ver.ejecutar(ctx, copropiedadId);
    if (!vistos.ok) return vistos;
    return { ok: true, valor: { declarada: true, ocupantes: vistos.valor } };
  }

  private rechazo(motivo: MotivoDeNoDeclarar): Resultado<ResultadoDeDeclaracion, ErrorDominio> {
    return { ok: true, valor: { declarada: false, motivo, dePermiso: esMotivoDePermiso(motivo) } };
  }
}

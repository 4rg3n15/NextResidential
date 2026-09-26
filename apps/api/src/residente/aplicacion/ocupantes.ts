import { Inject, Injectable } from '@nestjs/common';
import {
  AVISO_OCUPANTES_DEFINITIVO,
  RELOJ,
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
 * OCUPANTES · DECLARAR UNA VEZ, CONSULTAR SIEMPRE (D6, 3.3, ADR-025)
 *
 * El residente ve los códigos de las plazas LIBRES —para dárselos a quien vive
 * con él— y el nombre de quien ocupa las demás. El código de una plaza ocupada
 * ya no sirve para nada y no se muestra.
 *
 * Declarar es del primer residente y una sola vez. Cualquier otro intento
 * —volver a declarar, otro ocupante que lo intenta— es un rechazo de PERMISO
 * (403 en la ruta), porque cambiar el número le toca al superadministrador.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface PlazaVisible {
  readonly id: string;
  readonly numero: number;
  readonly libre: boolean;
  /** Sólo en las libres: «ABCD-EFGH». */
  readonly codigo: string | null;
  readonly ocupante: string | null;
}

export interface MisOcupantes {
  readonly declarados: number;
  readonly declarada: boolean;
  readonly plazas: readonly PlazaVisible[];
  readonly aviso: string;
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
): PlazaVisible[] =>
  plazas.map((p) => ({
    id: p.id,
    numero: p.numero,
    libre: p.usuarioId === null,
    codigo:
      p.usuarioId === null
        ? formatearCodigoDeOcupante(codigos.codigoDe(copropiedadId, p.id, p.generacion))
        : null,
    ocupante: p.ocupante,
  }));

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
        plazas: plazasVisibles(this.codigos, copropiedadId, plazas),
        aviso: AVISO_OCUPANTES_DEFINITIVO,
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
    pedido: { readonly numero: number; readonly confirmado: boolean },
  ): Promise<Resultado<ResultadoDeDeclaracion, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { viviendaId } = r.valor.ambito;
    const d = await this.ocupantes.declaracion(copropiedadId, viviendaId, ctx.usuarioId);
    const decision = decidirDeclaracion({
      numero: pedido.numero,
      confirmado: pedido.confirmado,
      esPrimerResidente: d.esPrimerResidente,
      yaDeclarada: d.declarada,
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

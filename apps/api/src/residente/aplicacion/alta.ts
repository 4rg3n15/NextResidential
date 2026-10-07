import { Inject, Injectable } from '@nestjs/common';
import {
  PLAZAS_POR_DEFECTO,
  RELOJ,
  VENTANA_DE_INTENTOS_MINUTOS,
  avisoDeOcupantes,
  decidirVinculacion,
  explicacionDeVinculacion,
  normalizarCodigoDeOcupante,
  validarPerfil,
} from '@ncr/domain-core';
import type { CampoRechazado, DatosDelPerfil, MotivoDeNoVincular, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import {
  ALTA_DEL_RESIDENTE,
  BITACORA_DE_RESIDENTES,
  CODIGOS_DE_OCUPANTE,
  OCUPANTES_DE_LA_VIVIENDA,
} from './puertos-hogar';
import type {
  AltaDelResidente,
  BitacoraDeResidentes,
  CodigosDeOcupante,
  OcupantesDeLaVivienda,
  VocabularioDeAlta,
} from './puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ALTA DEL RESIDENTE · ETAPA 15-I (3.2, 3.5) · RONDA 15-W (D3, D-W9)
 *
 * Desde la 15-W la cuenta YA trae su vivienda: la del titular la asignó la
 * administración (D1) y la de los demás, la plaza de su código (D2). El primer
 * ingreso sólo completa a la persona (`primer-ingreso.ts`); aquí quedan:
 *
 *  · VER el estado: qué le falta a la cuenta, o que la administración aún no
 *    le asignó vivienda (una cuenta antigua, anterior a la 15-W);
 *  · CAMBIAR de vivienda desde el perfil (3.5): SIEMPRE con el código de una
 *    plaza libre de la vivienda de destino, con o sin el prefijo de su conjunto.
 *    Un prefijo de otro conjunto cuenta como código incorrecto.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const AVISO_SIN_VIVIENDA = 'La administración debe asignarle su vivienda';

export interface EstadoDeMiAlta {
  readonly completa: boolean;
  readonly viviendaVinculada: boolean;
  /** 15-W · la cuenta ya trae vivienda (asignada o vinculada). */
  readonly viviendaAsignada: boolean;
  readonly debeDeclararOcupantes: boolean;
  readonly vocabulario: VocabularioDeAlta;
  /** 3.2 · en un conjunto de apartamentos la torre es obligatoria (cambio de vivienda). */
  readonly pideAgrupacion: boolean;
  readonly avisoOcupantes: string;
  /** 15-W · lo que lee una cuenta sin vivienda; `null` si la tiene. */
  readonly aviso: string | null;
}

export interface EntradaDeAlta {
  readonly perfil: DatosDelPerfil;
  readonly identificador: string;
  readonly agrupacion: string | null;
  readonly codigo: string | null;
}

export type ResultadoDeAlta =
  | { readonly vinculada: true; readonly debeDeclararOcupantes: boolean }
  | {
      readonly vinculada: false;
      readonly motivo: MotivoDeNoVincular;
      readonly explicacion: string;
    }
  | { readonly vinculada: false; readonly campos: readonly CampoRechazado[] };

@Injectable()
export class VerMiAlta {
  constructor(@Inject(ALTA_DEL_RESIDENTE) private readonly alta: AltaDelResidente) {}

  async ejecutar(ctx: ContextoTenant, copropiedadId: string): Promise<EstadoDeMiAlta | null> {
    const vocabulario = await this.alta.vocabulario(copropiedadId);
    if (vocabulario === null) return null;
    const estado = await this.alta.estado(copropiedadId, ctx.usuarioId);
    const vinculada = estado.viviendaId !== null;
    const conVivienda = vinculada || estado.viviendaAsignada !== null;
    return {
      completa: vinculada && !estado.debeDeclararOcupantes,
      viviendaVinculada: vinculada,
      viviendaAsignada: conVivienda,
      debeDeclararOcupantes: estado.debeDeclararOcupantes,
      vocabulario,
      pideAgrupacion: vocabulario.tipo === 'apartamentos',
      avisoOcupantes: avisoDeOcupantes(estado.topeDePlazas ?? PLAZAS_POR_DEFECTO),
      aviso: conVivienda ? null : AVISO_SIN_VIVIENDA,
    };
  }
}

/** 3.5 · el cambio de vivienda: siempre con código de plaza (D-W9). */
@Injectable()
export class VincularMiVivienda {
  constructor(
    @Inject(ALTA_DEL_RESIDENTE) private readonly alta: AltaDelResidente,
    @Inject(CODIGOS_DE_OCUPANTE) private readonly codigos: CodigosDeOcupante,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
    @Inject(OCUPANTES_DE_LA_VIVIENDA) private readonly ocupantes: OcupantesDeLaVivienda,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    entrada: EntradaDeAlta,
  ): Promise<ResultadoDeAlta> {
    const ahora = this.reloj.ahora();
    const perfil = validarPerfil(entrada.perfil, ahora);
    if (!perfil.ok) return { vinculada: false, campos: perfil.error };

    const estado = await this.alta.estado(copropiedadId, ctx.usuarioId);
    const rechazo = (motivo: MotivoDeNoVincular): ResultadoDeAlta => ({
      vinculada: false,
      motivo,
      explicacion: explicacionDeVinculacion(motivo),
    });
    // Cambiar de vivienda exige estar vinculado: el primer ingreso es otra ruta.
    if (estado.viviendaId === null) return rechazo('VIVIENDA_INEXISTENTE');

    const desde = new Date(ahora.getTime() - VENTANA_DE_INTENTOS_MINUTOS * 60_000);
    const intentos = await this.alta.codigosIncorrectosDesde(copropiedadId, ctx.usuarioId, desde);
    const halladas = await this.alta.buscarVivienda(
      copropiedadId,
      ctx.usuarioId,
      entrada.identificador,
      entrada.agrupacion,
    );
    if (halladas.length > 1) return this.rechazar(ctx, copropiedadId, 'AGRUPACION_REQUERIDA', null);
    const vivienda = halladas[0];
    if (vivienda?.id === estado.viviendaId) return rechazo('YA_VINCULADA');

    const { esPrimerResidente } = await this.ocupantes.declaracion(
      copropiedadId,
      estado.viviendaId,
      ctx.usuarioId,
    );
    const decision = decidirVinculacion({
      esTitular: esPrimerResidente,
      intentosFallidosRecientes: intentos,
      viviendaExiste: vivienda !== undefined,
      viviendaActiva: vivienda?.activa ?? false,
      viviendaTieneCuenta: vivienda?.tieneCuenta ?? false,
      traeCodigo: entrada.codigo !== null && entrada.codigo.trim() !== '',
    });
    if (decision.vincular === false || vivienda === undefined) {
      const motivo = decision.vincular === false ? decision.motivo : 'VIVIENDA_INEXISTENTE';
      return this.rechazar(ctx, copropiedadId, motivo, vivienda?.id ?? null);
    }

    const plaza = await this.plazaDe(copropiedadId, vivienda.id, entrada.codigo ?? '');
    if (plaza === null) return this.codigoIncorrecto(ctx, copropiedadId, vivienda.id);
    const escrito = await this.alta.vincular({
      copropiedadId,
      usuarioId: ctx.usuarioId,
      viviendaId: vivienda.id,
      modo: { tipo: 'plaza', plazaId: plaza.id, generacion: plaza.generacion },
      perfil: perfil.valor,
      ahora,
    });
    if (!escrito.ok) {
      return escrito.motivo === 'CODIGO_INCORRECTO'
        ? this.codigoIncorrecto(ctx, copropiedadId, vivienda.id)
        : this.rechazar(ctx, copropiedadId, escrito.motivo, vivienda.id);
    }
    return { vinculada: true, debeDeclararOcupantes: false };
  }

  /** El prefijo, si lo trae, tiene que ser el de ESTA copropiedad (D2). */
  private async plazaDe(copropiedadId: string, viviendaId: string, bruto: string) {
    const codigo = normalizarCodigoDeOcupante(bruto);
    if (!codigo.ok) return null;
    if (codigo.valor.prefijo !== null) {
      const vocabulario = await this.alta.vocabulario(copropiedadId);
      if (codigo.valor.prefijo !== vocabulario?.codigoCorto) return null;
    }
    const libres = await this.alta.plazasLibres(copropiedadId, viviendaId);
    return this.codigos.plazaDelCodigo(copropiedadId, libres, codigo.valor.codigo);
  }

  private async codigoIncorrecto(
    ctx: ContextoTenant,
    copropiedadId: string,
    viviendaId: string,
  ): Promise<ResultadoDeAlta> {
    await this.bitacora.anotar({
      copropiedadId,
      tipo: 'codigo_incorrecto',
      ocurridoEn: this.reloj.ahora(),
      usuarioId: ctx.usuarioId,
      actorId: ctx.usuarioId,
      viviendaId,
    });
    return {
      vinculada: false,
      motivo: 'CODIGO_INCORRECTO',
      explicacion: explicacionDeVinculacion('CODIGO_INCORRECTO'),
    };
  }

  private async rechazar(
    ctx: ContextoTenant,
    copropiedadId: string,
    motivo: MotivoDeNoVincular,
    viviendaId: string | null,
  ): Promise<ResultadoDeAlta> {
    await this.bitacora.anotar({
      copropiedadId,
      tipo: motivo === 'DEMASIADOS_INTENTOS' ? 'vinculacion_bloqueada' : 'vinculacion_rechazada',
      ocurridoEn: this.reloj.ahora(),
      usuarioId: ctx.usuarioId,
      actorId: ctx.usuarioId,
      viviendaId,
      detalle: motivo,
    });
    return { vinculada: false, motivo, explicacion: explicacionDeVinculacion(motivo) };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  AVISO_OCUPANTES_DEFINITIVO,
  RELOJ,
  VENTANA_DE_INTENTOS_MINUTOS,
  decidirVinculacion,
  explicacionDeVinculacion,
  normalizarCodigoDeOcupante,
  validarPerfil,
} from '@ncr/domain-core';
import type { CampoRechazado, DatosDelPerfil, MotivoDeNoVincular, Reloj } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { ALTA_DEL_RESIDENTE, BITACORA_DE_RESIDENTES, CODIGOS_DE_OCUPANTE } from './puertos-hogar';
import type {
  AltaDelResidente,
  BitacoraDeResidentes,
  CodigosDeOcupante,
  ModoDeVinculo,
  VocabularioDeAlta,
} from './puertos-hogar';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PRIMER INGRESO DEL RESIDENTE · ETAPA 15-I (3.2)
 *
 * El superadministrador crea la cuenta con usuario y contraseña (3.1). En el
 * primer ingreso la app obliga a cambiar la contraseña (ADR-023, lo impone el
 * servidor) y después a completar ESTE formulario: contacto real, documento, la
 * vivienda —que tiene que existir— y el código de vinculación. Hasta completarlo
 * la cuenta no tiene vivienda y ninguna ruta de `/mi` le devuelve nada.
 *
 * Cambiar de vivienda desde el perfil pasa por aquí con `cambio: true`, y
 * entonces el código es SIEMPRE obligatorio (3.5): «no lo tengo» sólo lo puede
 * decir quien llega a una vivienda vacía por primera vez.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface EstadoDeMiAlta {
  readonly completa: boolean;
  readonly viviendaVinculada: boolean;
  readonly debeDeclararOcupantes: boolean;
  readonly vocabulario: VocabularioDeAlta;
  /** 3.2 · en un conjunto de apartamentos la torre es obligatoria. */
  readonly pideAgrupacion: boolean;
  readonly avisoOcupantes: string;
}

export interface EntradaDeAlta {
  readonly perfil: DatosDelPerfil;
  readonly identificador: string;
  readonly agrupacion: string | null;
  /** `null` = marcó «no lo tengo». */
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
    return {
      completa: vinculada && !estado.debeDeclararOcupantes,
      viviendaVinculada: vinculada,
      debeDeclararOcupantes: estado.debeDeclararOcupantes,
      vocabulario,
      pideAgrupacion: vocabulario.tipo === 'apartamentos',
      avisoOcupantes: AVISO_OCUPANTES_DEFINITIVO,
    };
  }
}

@Injectable()
export class VincularMiVivienda {
  constructor(
    @Inject(ALTA_DEL_RESIDENTE) private readonly alta: AltaDelResidente,
    @Inject(CODIGOS_DE_OCUPANTE) private readonly codigos: CodigosDeOcupante,
    @Inject(BITACORA_DE_RESIDENTES) private readonly bitacora: BitacoraDeResidentes,
    @Inject(RELOJ) private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    entrada: EntradaDeAlta,
    opciones: { readonly cambio: boolean },
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
    // El alta es UNA vez; cambiar de vivienda exige estar vinculado.
    if (!opciones.cambio && estado.viviendaId !== null) return rechazo('YA_VINCULADA');
    if (opciones.cambio && estado.viviendaId === null) return rechazo('VIVIENDA_INEXISTENTE');

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
    if (opciones.cambio && vivienda?.id === estado.viviendaId) return rechazo('YA_VINCULADA');

    const traeCodigo = entrada.codigo !== null && entrada.codigo.trim() !== '';
    if (opciones.cambio && !traeCodigo) {
      return this.rechazar(ctx, copropiedadId, 'CODIGO_REQUERIDO', vivienda?.id ?? null);
    }
    const decision = decidirVinculacion({
      intentosFallidosRecientes: intentos,
      viviendaExiste: vivienda !== undefined,
      viviendaActiva: vivienda?.activa ?? false,
      viviendaTieneCuenta: vivienda?.tieneCuenta ?? false,
      traeCodigo,
    });
    if (decision.vincular === false || vivienda === undefined) {
      const motivo = decision.vincular === false ? decision.motivo : 'VIVIENDA_INEXISTENTE';
      return this.rechazar(ctx, copropiedadId, motivo, vivienda?.id ?? null);
    }

    let modo: ModoDeVinculo = { tipo: 'primer_residente' };
    if (decision.vincular === 'con_codigo') {
      const plaza = await this.plazaDe(copropiedadId, vivienda.id, entrada.codigo ?? '');
      if (plaza === null) return this.codigoIncorrecto(ctx, copropiedadId, vivienda.id);
      modo = { tipo: 'plaza', plazaId: plaza.id, generacion: plaza.generacion };
    }

    const escrito = await this.alta.vincular({
      copropiedadId,
      usuarioId: ctx.usuarioId,
      viviendaId: vivienda.id,
      modo,
      perfil: perfil.valor,
      ahora,
    });
    if (!escrito.ok) {
      return escrito.motivo === 'CODIGO_INCORRECTO'
        ? this.codigoIncorrecto(ctx, copropiedadId, vivienda.id)
        : this.rechazar(ctx, copropiedadId, escrito.motivo, vivienda.id);
    }
    return { vinculada: true, debeDeclararOcupantes: modo.tipo === 'primer_residente' };
  }

  private async plazaDe(copropiedadId: string, viviendaId: string, bruto: string) {
    const codigo = normalizarCodigoDeOcupante(bruto);
    if (!codigo.ok) return null;
    const libres = await this.alta.plazasLibres(copropiedadId, viviendaId);
    return this.codigos.plazaDelCodigo(copropiedadId, libres, codigo.valor);
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

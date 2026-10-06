import type { EscrituraDelVinculo } from '../../cuentas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * QUIÉN ES EL TITULAR DE CADA VIVIENDA · RONDA 15-W (D-W9, D1, ADR-037)
 *
 * La PRIMERA cuenta de cada vivienda la crea la administración, ya asignada a
 * ella: esa cuenta es el titular (`ocupacion_de_viviendas.primer_residente_id`).
 * Antes de la 15-W cualquiera se hacía titular de una vivienda vacía marcando
 * «no lo tengo» (problema 1, CRÍTICO): ahora sólo esta puerta lo hace.
 *
 * «Con titular» es la misma pregunta en todas partes: vive en ella alguien con
 * cuenta activa, la administración ya le asignó su titular, o alguien con
 * cuenta activa ocupa una de sus plazas.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const TITULARIDAD_DE_VIVIENDAS = Symbol('TITULARIDAD_DE_VIVIENDAS');

export type ViviendaParaTitular = 'LIBRE' | 'INEXISTENTE' | 'INACTIVA' | 'CON_TITULAR';

export type AsignacionDeVivienda =
  | 'ASIGNADA'
  | 'CUENTA_INEXISTENTE'
  | 'CUENTA_CON_VIVIENDA'
  | 'VIVIENDA_INEXISTENTE'
  | 'VIVIENDA_INACTIVA'
  | 'CON_TITULAR';

export interface ViviendaSinTitular {
  readonly id: string;
  readonly identificador: string;
  readonly agrupacion: string | null;
}

export interface TitularidadDeViviendas {
  /** ¿Puede esa vivienda recibir a su titular? Sólo si existe aquí, está activa y no lo tiene. */
  viviendaParaTitular(copropiedadId: string, viviendaId: string): Promise<ViviendaParaTitular>;
  /** Lo que la cuenta del titular escribe en SU transacción; `false` si otra alta ganó. */
  escrituraDelTitular(
    copropiedadId: string,
    viviendaId: string,
    actorId: string,
  ): EscrituraDelVinculo;
  /** D1 · una cuenta ANTIGUA, sin vivienda, recibe la suya como titular. Una transacción. */
  asignarVivienda(
    copropiedadId: string,
    usuarioId: string,
    viviendaId: string,
    motivo: string,
    actorId: string,
  ): Promise<AsignacionDeVivienda>;
  /** Para elegir en la consola: activas y sin titular, por número o agrupación (≤ 50). */
  viviendasSinTitular(
    copropiedadId: string,
    busqueda: string | null,
  ): Promise<readonly ViviendaSinTitular[]>;
}

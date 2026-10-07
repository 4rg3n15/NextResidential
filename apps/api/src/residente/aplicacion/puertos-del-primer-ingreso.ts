import type { PerfilValido } from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PRIMER INGRESO DE UNA CUENTA QUE YA TRAE SU VIVIENDA · RONDA 15-W (D3)
 *
 * Desde la 15-W ninguna cuenta elige vivienda en su primer ingreso: la del
 * titular la asignó la administración (D1) y la de los demás, su plaza (D2).
 * El primer ingreso sólo completa a la PERSONA —nombre, documento de adulto,
 * teléfono y fecha de nacimiento— y la hace residente de ESA vivienda.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const PRIMER_INGRESO = Symbol('PRIMER_INGRESO');

export interface PedidoDePrimerIngreso {
  readonly copropiedadId: string;
  readonly usuarioId: string;
  readonly viviendaId: string;
  /** El titular (D1) entra como `es_titular`; el de una plaza, no. */
  readonly comoTitular: boolean;
  readonly perfil: PerfilValido;
  readonly ahora: Date;
}

export type PrimerIngresoEscrito =
  | { readonly ok: true; readonly residenteId: string }
  /** SIN_VIVIENDA: la asignación desapareció entre la lectura y la escritura. */
  | { readonly ok: false; readonly motivo: 'DOCUMENTO_EN_USO' | 'SIN_VIVIENDA' };

export interface PrimerIngreso {
  /**
   * TODO en una transacción, bajo el bloqueo de la vivienda: la persona (la del
   * documento si está libre), el residente, la cuenta atada a ella y su rastro.
   */
  completar(pedido: PedidoDePrimerIngreso): Promise<PrimerIngresoEscrito>;
  /**
   * D3 · la cuenta de quien resulta menor queda BLOQUEADA: inactiva, sin rol y
   * con su fila `cuenta_bloqueada_por_edad`. Su plaza, si la tenía, se libera.
   */
  bloquearPorEdad(copropiedadId: string, usuarioId: string, ahora: Date): Promise<void>;
}

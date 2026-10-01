import type { ContextoTenant } from '../../autenticacion';

/**
 * 15-P · P3 · LA PUERTA DEL PUNTO ELEGIDO.
 *
 * Puerto que declara la guardia (el consumidor) y satisface el módulo de
 * equipos, dueño de `puntos_de_acceso`. La orden manual lo pregunta ANTES de
 * registrar y de accionar: un punto que no es de ese equipo, de esa
 * copropiedad o que está dado de baja no existe, y la orden no sale (denegar
 * por defecto). Sin punto, la orden abre la puerta de la ficha del equipo,
 * como hasta la 15-P (R1).
 */
export interface PuntoDeLaOrden {
  readonly id: string;
  readonly nombre: string;
  readonly numeroDePuerta: number;
}

export interface PuntosDelEquipo {
  resolver(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    puntoId: string,
  ): Promise<PuntoDeLaOrden | null>;
}
export const PUNTOS_DEL_EQUIPO = Symbol.for('ncr.puerto.PuntosDelEquipo');

/** Quien no conoce puntos no resuelve ninguno: cualquier `puntoId` se niega. */
export const SIN_PUNTOS: PuntosDelEquipo = { resolver: async () => null };

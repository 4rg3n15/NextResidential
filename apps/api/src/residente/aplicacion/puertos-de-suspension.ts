/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL REGISTRO SUSPENDIDO POR INTENTOS, VISTO POR EL SUPERADMINISTRADOR · 15-W (§7)
 *
 * Treinta códigos fallidos en una hora en una misma copropiedad suspenden su
 * «Crear cuenta» durante una hora (la bitácora los cuenta). El
 * superadministrador lo ve en Configuración y puede REANUDARLO antes, con
 * motivo: la reanudación es una fila más de la bitácora (`registro_reanudado`),
 * que es de solo inserción, así que queda auditada por construcción.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const SUSPENSION_DEL_REGISTRO = Symbol('SUSPENSION_DEL_REGISTRO');

export interface EstadoDelRegistro {
  readonly suspendido: boolean;
  /** Hasta cuándo, si nadie lo reanuda antes. */
  readonly hasta: Date | null;
  /** Códigos fallidos en la última hora. */
  readonly fallosRecientes: number;
}

export interface SuspensionDelRegistro {
  estado(copropiedadId: string, ahora: Date): Promise<EstadoDelRegistro>;
  /** `false` si no estaba suspendido: nada que reanudar. */
  reanudar(copropiedadId: string, motivo: string, actorId: string, ahora: Date): Promise<boolean>;
}

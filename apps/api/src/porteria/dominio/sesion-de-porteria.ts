/**
 * LA SESIÓN DEL PORTERO · máquina de estados (ADR-024).
 *
 *   activa ──patrullaje──▶ patrullaje ──código correcto──▶ activa
 *     │                        │ 5.º código incorrecto
 *     └──────── cierre ◀───────┘ (manual, fin de turno, restablecimiento)
 *
 * El patrullaje es un BLOQUEO DE PANTALLA impuesto en el servidor, no un
 * factor de autenticación: el código se muestra en la propia consola y sólo
 * demuestra que quien vuelve a la garita lo vio antes de salir. Lo que sí
 * garantiza es que, mientras dure, la API rechaza toda acción operativa de
 * esa sesión, aunque se recargue la página o se llame a la API directamente.
 */
export type EstadoDeSesion = 'activa' | 'patrullaje' | 'cerrada';
export type MotivoDeCierre =
  | 'manual'
  | 'fin_de_turno'
  | 'intentos_agotados'
  | 'restablecimiento'
  | 'baja';

export const MAXIMO_DE_INTENTOS = 5;

export interface SesionDePorteria {
  readonly sesionId: string;
  readonly copropiedadId: string;
  readonly porteroId: string;
  readonly turnoId: string;
  readonly estado: EstadoDeSesion;
  readonly codigoHash: string;
  readonly intentosFallidos: number;
  readonly iniciadaEn: Date;
  readonly patrullajeDesde: Date | null;
  readonly cerradaEn: Date | null;
  readonly motivoCierre: MotivoDeCierre | null;
  readonly origenDeclarado: string | null;
}

/** Cambios que la máquina de estados produce; el repositorio los aplica. */
export interface CambioDeSesion {
  readonly estado?: EstadoDeSesion;
  readonly patrullajeDesde?: Date | null;
  readonly intentosFallidos?: number;
  readonly cerradaEn?: Date | null;
  readonly motivoCierre?: MotivoDeCierre | null;
  readonly turnoId?: string;
  readonly codigoHash?: string;
}

export const alIniciarPatrullaje = (s: SesionDePorteria, ahora: Date): CambioDeSesion | null =>
  s.estado === 'activa'
    ? { estado: 'patrullaje', patrullajeDesde: ahora, intentosFallidos: 0 }
    : null;

export const alDesbloquear = (): CambioDeSesion => ({
  estado: 'activa',
  patrullajeDesde: null,
  intentosFallidos: 0,
});

export const alCerrar = (motivo: MotivoDeCierre, ahora: Date): CambioDeSesion => ({
  estado: 'cerrada',
  patrullajeDesde: null,
  cerradaEn: ahora,
  motivoCierre: motivo,
});

export const intentosAgotados = (intentos: number): boolean => intentos >= MAXIMO_DE_INTENTOS;

import type { Autorizacion } from '../autorizaciones/autorizacion';
import type { VersionDeReglas } from '../autorizaciones/version-de-reglas';

export type MetodoDeAcceso = 'placa' | 'facial' | 'manual' | 'remoto' | 'tarjeta';

export interface ZonaSolicitada {
  readonly id: string;
  /** `false` si la zona está fuera de su horario en el instante evaluado (RN-14). */
  readonly dentroDeHorario: boolean;
  /** `true` si el aforo ya está en su máximo (RN-14, CA-14). */
  readonly aforoCompleto: boolean;
  /** Zona restringida: exige que la autorización la incluya explícitamente. */
  readonly restringida: boolean;
}

/**
 * Contexto de evaluación: **todo lo que el motor necesita, ya resuelto**.
 *
 * Aquí está la decisión que hace posible que el motor sea puro. Nada de esto se
 * consulta durante la evaluación: la capa de aplicación lo carga antes y lo
 * entrega cerrado. Si el motor pudiera preguntar, tendría I/O, dejaría de ser
 * reproducible y no podría correr idéntico en el Edge — que es justo lo que
 * RN-16 exige.
 *
 * `ahora` viaja en el contexto por el mismo motivo: el reloj se inyecta, nunca
 * se lee (§2.4). Es lo que permite probar el minuto exacto del borde.
 */
export interface ContextoDeAcceso {
  readonly ahora: Date;
  readonly copropiedadId: string;
  readonly versionDeReglas: VersionDeReglas;

  readonly personaId: string | null;
  readonly viviendaId: string | null;
  readonly metodo: MetodoDeAcceso;

  /** Autorizaciones de la persona, ya filtradas por copropiedad. */
  readonly autorizaciones: readonly Autorizacion[];

  /** Identidades vetadas: la persona, y también sus acompañantes (D-01, RN-06). */
  readonly personasEnListaNegra: ReadonlySet<string>;

  /** Placas vetadas, normalizadas (RN-06). */
  readonly placasEnListaNegra: ReadonlySet<string>;
  readonly placaLeida: string | null;
  /** `false` si la placa leída no corresponde a ningún vehículo registrado. */
  readonly placaConocida: boolean;

  readonly viviendaActiva: boolean;
  readonly zona: ZonaSolicitada | null;

  /** Confianza de la lectura biométrica o de placa, 0..1. */
  readonly confianza: number;
  readonly umbralDeConfianza: number;

  /** RN-09/RN-10: solo aplica cuando el método es biométrico. */
  readonly consentimientoVigente: boolean;
}

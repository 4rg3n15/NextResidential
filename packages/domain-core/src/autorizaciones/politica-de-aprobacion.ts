/**
 * ═════════════════════════════════════════════════════════════════════════════
 * POLÍTICA DE APROBACIÓN DE AUTORIZACIONES · PUNTO DE EXTENSIÓN (D5 c, ADR-027)
 *
 * Hoy una autorización de visitante —también la de un vehículo de TERCERO— se
 * aprueba AL INSTANTE: el residente la crea y el motor la deja pasar dentro de
 * su día y su franja. El cliente quiere poder exigir, más adelante, que el
 * PORTERO dé la aprobación final antes del acceso, sin reescribir nada.
 *
 * Por eso la pregunta «¿con qué estado nace?» no está escrita en el caso de
 * uso: la contesta una política componible (OCP, §2.3). Cambiar el modo es
 * elegir otra política, no editar `evaluarAcceso` ni el agregado. Una
 * autorización `pendiente_de_aprobacion` no está `activa`, y el motor —que
 * sólo lee las activas— la deniega sin enterarse de que existe este fichero.
 *
 * Lo que NO está construido, y el ADR-027 lo dice paso a paso: el estado en la
 * base (hoy el enumerado sólo tiene activa/revocada), la cola en la consola de
 * portería y el evento auditado de la aprobación. La columna
 * `copropiedades.aprobacion_de_terceros` sólo admite 'automatica' (0038).
 * ═════════════════════════════════════════════════════════════════════════════
 */

export type ModoDeAprobacion = 'automatica' | 'portero';
export type EstadoInicialDeAutorizacion = 'activa' | 'pendiente_de_aprobacion';

/** Lo que la política puede mirar de una solicitud. */
export interface SolicitudDeAutorizacion {
  /** Trae placa: entra un vehículo que no es del padrón (tercero, D5 b). */
  readonly traeVehiculo: boolean;
  /** Es recurrente (patrón de días y franja). */
  readonly recurrente: boolean;
}

/** Especificación como lambda, con sus combinadores (§2.4). */
export type Especificacion<T> = (t: T) => boolean;
export const y =
  <T>(a: Especificacion<T>, b: Especificacion<T>): Especificacion<T> =>
  (t) =>
    a(t) && b(t);
export const o =
  <T>(a: Especificacion<T>, b: Especificacion<T>): Especificacion<T> =>
  (t) =>
    a(t) || b(t);
export const no =
  <T>(a: Especificacion<T>): Especificacion<T> =>
  (t) =>
    !a(t);

export const esVehiculoDeTercero: Especificacion<SolicitudDeAutorizacion> = (s) => s.traeVehiculo;

export type PoliticaDeAprobacion = (s: SolicitudDeAutorizacion) => EstadoInicialDeAutorizacion;

/** D5 b · el único modo activo hoy: aprobada al instante. */
export const aprobacionAutomatica: PoliticaDeAprobacion = () => 'activa';

/** D5 c · lo que aplica la especificación queda pendiente del portero; lo demás, activo. */
export const aprobacionDelPortero =
  (aplicaA: Especificacion<SolicitudDeAutorizacion>): PoliticaDeAprobacion =>
  (s) =>
    aplicaA(s) ? 'pendiente_de_aprobacion' : 'activa';

/** La configuración de la copropiedad elige la política; el caso de uso sólo la aplica. */
export const politicaDeAprobacionPara = (modo: ModoDeAprobacion): PoliticaDeAprobacion =>
  modo === 'portero' ? aprobacionDelPortero(esVehiculoDeTercero) : aprobacionAutomatica;

/**
 * Lo único que HOY se puede persistir es `activa`: el estado
 * `pendiente_de_aprobacion` no existe todavía en la base (ADR-027, paso 1).
 * Si una política distinta de la automática llegara a pedirlo antes de que
 * exista, la creación FALLA CERRADA (§2.1.4) en vez de guardar como activa
 * algo que debía esperar al portero.
 */
export const estadoPersistible = (estado: EstadoInicialDeAutorizacion): estado is 'activa' =>
  estado === 'activa';

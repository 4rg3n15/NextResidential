/**
 * Operaciones sobre un equipo — configurar, sincronizar, reiniciar (HU-36).
 *
 * **Qué hace esto hoy, dicho sin adorno.** Encola la intención y la deja
 * auditada. No habla con ningún equipo: eso es la ETAPA 15, y ADR-03 exige que
 * todo el sistema funcione antes contra `MockProvider`. La pantalla puede
 * pedirlo, el sistema deja constancia de quién lo pidió y cuándo, y el
 * adaptador real entra detrás de este mismo puerto sin tocar nada más.
 *
 * **Por qué se construye ahora y no se deja para la 15.** Porque el botón
 * existe en el mockup, y un botón que no hace nada es peor que ninguno: quien
 * lo pulsa cree que sincronizó. Aquí el resultado dice exactamente lo que
 * ocurrió —«encolada»—, y el estado del equipo pasa a `sincronizando` para que
 * la interfaz no mienta.
 */
export type OperacionDeDispositivo = 'configuracion' | 'sincronizacion' | 'reinicio';

export interface SolicitudDeOperacion {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly operacion: OperacionDeDispositivo;
  readonly solicitadaPor: string;
  readonly solicitadaEn: Date;
}

export interface ResultadoDeOperacion {
  readonly encolada: boolean;
  readonly operacion: OperacionDeDispositivo;
  /** Estado que la interfaz debe mostrar desde ya. */
  readonly estado: 'sincronizando';
  readonly detalle: string;
}

export interface OperacionesDeDispositivo {
  solicitar(solicitud: SolicitudDeOperacion): Promise<ResultadoDeOperacion>;
  /** Operaciones pendientes de un equipo; la interfaz muestra «sincronizando». */
  pendientesDe(copropiedadId: string): Promise<readonly string[]>;
}

export const OPERACIONES_DE_DISPOSITIVO = Symbol.for('ncr.puerto.OperacionesDeDispositivo');

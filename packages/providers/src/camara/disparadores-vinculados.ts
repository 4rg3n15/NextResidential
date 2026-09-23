import { bloques, etiqueta } from '../equipo/xml';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA TERCERA VÍA · un disparador vinculado abre el relé, tenga `ctrlMode` el
 * valor que tenga
 *
 * El disparador de detección de vehículo lleva su propia lista de acciones
 * vinculadas, y una de ellas es **`IO`**: accionar una salida física del
 * equipo, identificada por su puerto. Si ese puerto es el relé de la barrera,
 * **el brazo sube en cuanto la cámara detecta un vehículo** — antes de que
 * nadie pregunte a Next Control, y con `ctrlMode` valiendo 1 y todas las
 * políticas internas conformes.
 *
 * Es la vía que ninguna comprobación anterior veía, y la que convierte un
 * veredicto verde en una afirmación falsa. Por eso se lee, y por eso el
 * hallazgo dice el número de puerto: sin él, «hay una acción de E/S» manda a
 * revisar una pantalla entera del equipo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Y EL HORARIO DE ARMADO, QUE PARECE OTRA COSA
 *
 * El mismo capítulo define el horario del disparador. Una detección **fuera de
 * horario no reporta**, y el síntoma en sitio es exactamente el de una cámara
 * averiada: no llega nada, el equipo responde a todo lo demás, y quien está
 * delante empieza por el cable. Se lee para poder decirlo, no para cambiarlo.
 */

/** Una acción vinculada al disparador, tal como la declara el equipo. */
export interface AccionVinculada {
  readonly metodo: string;
  /** Puerto de salida cuando el método es de E/S. */
  readonly puertoIO: string | null;
  /** `true` si esta acción puede mover algo físico sin pasar por nosotros. */
  readonly accionaSalida: boolean;
}

export interface VeredictoDeDisparador {
  /** `false` cuando la respuesta no traía el documento esperado. */
  readonly leido: boolean;
  readonly acciones: readonly AccionVinculada[];
  readonly accionesDeSalida: readonly AccionVinculada[];
  /** `true` si alguna acción vinculada acciona una salida física. */
  readonly abrePorSuCuenta: boolean;
  readonly detalle: string;
}

/**
 * Métodos de notificación que mueven algo físico.
 *
 * `IO` es el documentado para la salida de relé. Se acepta también la grafía
 * larga porque el mismo documento la usa en otra sección, y no distinguirlas
 * aquí sólo produciría un falso verde.
 */
const ACCIONA_SALIDA = /^(io|alarmout|alarmOut|outputIO)$/i;

export const leerDisparador = (cuerpo: string): VeredictoDeDisparador => {
  const leido = /EventTrigger|notificationMethod/i.test(cuerpo);
  const acciones = bloques(cuerpo, 'EventTriggerNotification').map((bloque) => {
    const metodo = (etiqueta(bloque, 'notificationMethod') ?? '').trim();
    return {
      metodo,
      puertoIO: etiqueta(bloque, 'outputIOPortID'),
      accionaSalida: ACCIONA_SALIDA.test(metodo),
    };
  });
  const accionesDeSalida = acciones.filter((a) => a.accionaSalida);

  return {
    leido,
    acciones,
    accionesDeSalida,
    abrePorSuCuenta: accionesDeSalida.length > 0,
    detalle: !leido
      ? 'El equipo no devolvió su disparador de detección: no se puede descartar que una ' +
        'acción vinculada accione la barrera'
      : accionesDeSalida.length === 0
        ? 'El disparador de detección no acciona ninguna salida física'
        : `El disparador acciona ${String(accionesDeSalida.length)} salida(s) física(s): ` +
          `puerto(s) ${accionesDeSalida.map((a) => a.puertoIO ?? '(sin declarar)').join(', ')}. ` +
          'Si alguno es el relé de la barrera, el brazo sube al detectar un vehículo y la ' +
          'decisión de Next Control llega tarde, valga lo que valga el modo de control',
  };
};

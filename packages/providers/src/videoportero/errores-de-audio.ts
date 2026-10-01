import { resumenIsapi } from '../equipo/errores-del-fabricante';

/**
 * 15-P · P2 · EL EQUIPO DICE QUE SU CANAL DE AUDIO ESTÁ OCUPADO.
 *
 * `PUT …/open` contesta con `twoWayAudioInProgressPleaseWait` (0x40002068)
 * cuando OTRO cliente tiene la conversación abierta. No se le quita: el
 * adaptador lanza `CanalDeAudioOcupado` (núcleo neutral) y suelta el turno.
 * Robar el canal con un `close` previo, que es lo que hace go2rtc, cortaría a
 * quien está hablando.
 */
export const CODIGO_CANAL_OCUPADO = '0x40002068';

export const esCanalOcupado = (cuerpo: string): boolean => {
  const r = resumenIsapi(cuerpo);
  return (
    r.subStatusCode === 'twoWayAudioInProgressPleaseWait' || r.errorCode === CODIGO_CANAL_OCUPADO
  );
};

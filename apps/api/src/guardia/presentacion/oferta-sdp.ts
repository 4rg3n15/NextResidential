import { TIPO_SDP } from '../../comun/ruta-de-video';

/**
 * V1 (15-N) · LA VALIDACIÓN PROPIA DE LA OFERTA SDP
 *
 * La oferta ya no pasa por el saneamiento de texto (lo recortaba y go2rtc la
 * rechazaba), así que su validación es la de su formato, y lo que no cumple
 * FALLA con 400 en vez de corregirse en silencio:
 *
 *  · el tipo (`application/sdp`) y el tamaño (64 KiB) los pone el parser de su
 *    ruta en la tubería: otro tipo no llega como cadena;
 *  · empieza por `v=0` (RFC 8866 §5.1);
 *  · no lleva caracteres de control fuera de los tres de una línea de texto
 *    (tabulador, CR, LF): un NUL o un escape no son SDP.
 *
 * Devuelve el motivo del rechazo, o `null` si la oferta es aceptable.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_FUERA_DE_LINEA = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export const motivoDeOfertaInvalida = (oferta: unknown): string | null => {
  if (typeof oferta !== 'string' || !oferta.startsWith('v=0')) {
    return `La oferta viaja como ${TIPO_SDP} y empieza por «v=0»`;
  }
  if (CONTROL_FUERA_DE_LINEA.test(oferta)) {
    return 'La oferta SDP lleva caracteres de control que no son de fin de línea';
  }
  return null;
};

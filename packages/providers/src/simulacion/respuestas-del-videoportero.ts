import { ESPACIO } from './documentos-del-simulado';

/** Las respuestas ISAPI del videoportero simulado en red (15-S6: fuera de `videoportero-de-audio.ts` para que no pase de 300 líneas). */
/** 0x40002068 en decimal, como lo escribe el equipo en `errorCode`. */
export const ERROR_CANAL_OCUPADO = 0x40002068;

export const respuestaHttp = (estado: string, cuerpo = '', tipo = 'application/xml'): string =>
  `HTTP/1.1 ${estado}\r\nContent-Type: ${tipo}\r\nContent-Length: ${String(Buffer.byteLength(cuerpo))}\r\n\r\n${cuerpo}`;

export const estadoIsapi = (
  ruta: string,
  codigo: number,
  cadena: string,
  sub: string,
  error?: number,
) =>
  `<?xml version="1.0" encoding="UTF-8"?><ResponseStatus version="2.0" xmlns="${ESPACIO}">` +
  `<requestURL>${ruta}</requestURL><statusCode>${String(codigo)}</statusCode>` +
  `<statusString>${cadena}</statusString><subStatusCode>${sub}</subStatusCode>` +
  (error === undefined ? '' : `<errorCode>${String(error)}</errorCode>`) +
  (error === ERROR_CANAL_OCUPADO
    ? '<errorMsg>Two-Way audio in progress...Please Wait.</errorMsg>'
    : '') +
  '</ResponseStatus>';

export const CAPACIDADES =
  `<?xml version="1.0" encoding="UTF-8"?><TwoWayAudioChannel version="2.0" xmlns="${ESPACIO}">` +
  '<id>1</id><enabled opt="true,false"/><audioCompressionType opt="G.711ulaw"/>' +
  '<audioSamplingRate opt="8.00"/></TwoWayAudioChannel>';

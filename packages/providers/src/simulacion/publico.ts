/**
 * El simulado de equipo que el paquete publica. Se separó del barril en la
 * 15-Q sin cambiar un solo nombre: `index.ts` lo reexporta entero.
 */
export * from './equipo-simulado';
export * from './camara-que-publica';
export { jpegConMedidas } from './imagenes-de-prueba';
export { negacionesLocalesPor, personasPor } from './personas-simuladas';
export { servidorRtspSimulado } from './servidor-rtsp';
export { ERROR_CANAL_OCUPADO, videoporteroDeAudioEnRed } from './videoportero-de-audio';
export type {
  EstadoDelVideoporteroEnRed,
  GuionDeAudioEnRed,
  VideoporteroDeAudioEnRed,
} from './videoportero-de-audio';
export {
  BYTES_POR_TRAMA,
  DetectorDeMarcas,
  FuenteDeTramas,
  tramaDeSilencio,
  tramaDeTono,
} from './marcas-de-audio';
export type { ServidorRtspSimulado, GuionRtsp } from './servidor-rtsp';
// E2/C1 (15-M) · el puente real para las pruebas que lo tengan (`GO2RTC_BIN`).
export {
  OFERTA_SDP_DE_PRUEBA,
  OMITIDA_SIN_BINARIO,
  OMITIDA_SIN_FFMPEG,
  arrancarGo2rtc,
  binarioFfmpeg,
  binarioGo2rtc,
  fuentesDeAudioParaGo2rtc,
} from './go2rtc-de-pruebas';
export type { Go2rtcDePruebas } from './go2rtc-de-pruebas';
// V1 (15-N) · la oferta del navegador, con su CRLF final, para la prueba extremo a extremo.
export { OFERTA_SDP_DE_NAVEGADOR } from './oferta-de-navegador';
export type { PersonaSimulada } from './personas-simuladas';

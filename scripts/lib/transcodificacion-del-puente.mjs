/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A3 (15-S2) · LO QUE `pnpm sitio:video` NECESITA PARA TRANSCODIFICAR
 *
 * Con VIDEO_TRANSCODIFICAR=auto (por omisión), la API pide a go2rtc la fuente
 * `ffmpeg:<flujo>#video=h264` cuando el navegador no acepta el códec del
 * equipo (H.265 en Chrome). go2rtc la resuelve lanzando ffmpeg contra su
 * PROPIO servidor RTSP —por eso la clave del equipo no llega a los argumentos
 * de ffmpeg (RN-21)— y eso exige dos cosas en el Mac:
 *
 *  1. El RTSP interno de go2rtc encendido, y SÓLO en 127.0.0.1: go2rtc deja
 *     entrar sin credencial a quien llega desde el propio Mac (medido en el
 *     banco de la 15-S2, aun con `username`/`password`), así que en la red no
 *     debe escucharse nunca. Con `nunca` sigue apagado, como hasta la 15-S1.
 *  2. ffmpeg en el PATH. No se descarga: en macOS, `brew install ffmpeg`.
 *
 * Funciones puras para probarlas sin arrancar nada.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

/** Dónde escucha el RTSP interno de go2rtc: sólo bucle local. [SUPUESTO] S-15S2-01 · el 8554, libre en el Mac. */
export const RTSP_INTERNO = '127.0.0.1:8554';

/** La política de `VIDEO_TRANSCODIFICAR`, o un error en palabras si no es una de las dos. */
export const politicaDeTranscodificacion = (valor) => {
  const v = (valor ?? '').trim() === '' ? 'auto' : valor.trim();
  return v === 'auto' || v === 'nunca'
    ? { politica: v, error: null }
    : {
        politica: null,
        error: `VIDEO_TRANSCODIFICAR debe ser «auto» o «nunca», no «${valor}»`,
      };
};

/** El `listen` del RTSP de go2rtc según la política: 127.0.0.1 con `auto`, apagado con `nunca`. */
export const escuchaRtspInterna = (politica) => (politica === 'auto' ? RTSP_INTERNO : '');

/** ffmpeg en el PATH (o `null`). `existe` se inyecta en las pruebas. */
export const buscarFfmpeg = (path, existe = existsSync) => {
  for (const d of (path ?? '').split(delimiter)) {
    if (d === '') continue;
    const ruta = join(d, 'ffmpeg');
    if (existe(ruta)) return ruta;
  }
  return null;
};

/**
 * Qué decir de ffmpeg: nada que hacer con `nunca`; con `auto`, dónde está o
 * cómo instalarlo. `falta` es lo que `--preparar` convierte en fallo.
 */
export const juzgarFfmpeg = (politica, ruta) => {
  if (politica === 'nunca') {
    return {
      falta: false,
      frase:
        'transcodificación apagada (VIDEO_TRANSCODIFICAR=nunca): un equipo en H.265 sólo se ' +
        've en Safari',
    };
  }
  if (ruta !== null) {
    return { falta: false, frase: `ffmpeg en ${ruta}: el puente transcodifica H.265 a H.264` };
  }
  return {
    falta: true,
    frase:
      'ffmpeg no está en el PATH: instálelo con `brew install ffmpeg` (en Linux, el paquete ' +
      'ffmpeg) para ver en Chrome los equipos en H.265, o ponga VIDEO_TRANSCODIFICAR=nunca si ' +
      'sólo usará Safari',
  };
};

/**
 * El puente del paso 7 de `pnpm sitio:ensayo`: con GO2RTC_URL negocia WebRTC
 * de verdad (E2/C1, 15-M) y con la MISMA política de transcodificación que la
 * API (A5, 15-S2).
 */
export const puenteDelEnsayo = (env) =>
  env.GO2RTC_URL
    ? { puente: { url: env.GO2RTC_URL, transcodificar: env.VIDEO_TRANSCODIFICAR ?? 'auto' } }
    : {};

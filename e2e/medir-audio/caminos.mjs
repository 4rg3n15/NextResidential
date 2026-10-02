/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P1 · LOS TRES CAMINOS DEL BANCO, CADA UNO CON SUS PIEZAS DE PRODUCCIÓN
 *
 * Un camino es lo que hace la consola —abrir, pulsar, soltar, colgar— dicho
 * como llamadas a la página. A además arranca su puente (go2rtc real), su
 * equipo y su RTSP: cada sesión de A va con un puente NUEVO, porque con el
 * mismo puente la segunda sesión no negocia (hallazgo de esta medida, que el
 * banco registra aparte en vez de esconderlo).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { dormir } from './sesion.mjs';

export const caminoB = (pagina, banco) => {
  const url = `${banco.url.replace('http', 'ws')}/ws`;
  return {
    abrir: () => pagina.evaluate((u) => window.__sesionB(u), url),
    pulsar: () => pagina.evaluate(() => window.__pulsarB()),
    soltar: () => pagina.evaluate(() => window.__soltarB()),
    cerrar: () => pagina.evaluate(() => window.__cerrarB()),
  };
};

export const caminoActual = (pagina, banco) => ({
  abrir: () => pagina.evaluate((u) => window.__sesionActual(u), banco.url),
  pulsar: () => pagina.evaluate((u) => window.__pulsarActual(u), banco.url),
  soltar: () => pagina.evaluate(() => window.__soltarActual()),
  cerrar: () => pagina.evaluate(() => window.__cerrarActual()),
});

/** A: equipo + RTSP con la misma bajada + go2rtc con las dos fuentes. */
export const prepararA = async ({ P, binario, credencial, banco, pagina }) => {
  const equipo = await P.videoporteroDeAudioEnRed(credencial);
  const rtsp = await P.servidorRtspSimulado({
    ...credencial,
    canales: { 101: 'H264' },
    audio: equipo.bajada,
  });
  const [fuenteRtsp, fuenteRetorno] = P.fuentesDeAudioParaGo2rtc({
    host: '127.0.0.1',
    puertoHttp: equipo.puerto,
    puertoRtsp: rtsp.puerto,
    ...credencial,
  });
  const go2rtc = await P.arrancarGo2rtc(binario, [
    'streams:',
    '  intercom:',
    `    - ${fuenteRtsp}`,
    `    - ${fuenteRetorno}`,
  ]);
  banco.usar({ go2rtc: go2rtc.url });
  const url = `${banco.url}/go2rtc/api/webrtc?src=intercom`;
  return {
    equipo,
    // En A no hay «pulsar» en el protocolo: la pista suena desde que se negocia.
    camino: {
      abrir: () => pagina.evaluate((u) => window.__sesionA(u), url),
      pulsar: async () => undefined,
      cerrar: () => pagina.evaluate(() => window.__cerrarA()),
    },
    /** Tras colgar: ¿negocia otra sesión con el MISMO puente? */
    segundaNegociacion: async (plazoMs) => {
      const intento = pagina
        .evaluate((u) => window.__sesionA(u), url)
        .then(
          () => 'negoció',
          (e) => `falló: ${String(e.message ?? e).split('\n')[0]}`,
        );
      return Promise.race([
        intento,
        dormir(plazoMs).then(() => `sin respuesta en ${String(plazoMs)} ms`),
      ]);
    },
    /** Qué productores y consumidores le quedan al puente. */
    estadoDelPuente: async () => {
      const flujo = await (await fetch(`${go2rtc.url}/api/streams?src=intercom`)).json();
      return {
        productores: (flujo.producers ?? []).length,
        consumidores: (flujo.consumers ?? []).length,
      };
    },
    cerrar: async () => {
      await go2rtc.cerrar();
      await rtsp.cerrar();
      await equipo.cerrar();
    },
  };
};

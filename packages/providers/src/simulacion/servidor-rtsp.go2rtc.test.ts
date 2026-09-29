import { afterEach, describe, expect, it } from 'vitest';
import {
  OFERTA_SDP_DE_PRUEBA,
  OMITIDA_SIN_BINARIO,
  arrancarGo2rtc,
  binarioGo2rtc,
} from './go2rtc-de-pruebas';
import type { Go2rtcDePruebas } from './go2rtc-de-pruebas';
import { servidorRtspSimulado } from './servidor-rtsp';
import type { ServidorRtspSimulado } from './servidor-rtsp';
import { origenRtspDe } from '../hikvision/video-rtsp';
import type { EquipoRegistrado } from '../hikvision/registro-de-equipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E2/C1 · LO VISTO EN SITIO EL 28/09, REPRODUCIDO CON EL PUENTE REAL
 *
 *  1. Con `streams: {}` en el YAML, go2rtc rechaza el `PUT /api/streams` con
 *     «did not find expected key» (evidencia 1). El `PATCH` no toca el fichero:
 *     el flujo vive en memoria y la credencial NO llega al disco (RN-21).
 *  2. Sin `#backchannel=0`, el puente pide el canal de retorno ONVIF en el
 *     DESCRIBE y el equipo cierra la conexión: «HTTP 500 · EOF» (evidencia 2).
 *     Con él, la negociación termina en SDP («v=0»).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const binario = binarioGo2rtc();
const CLAVE = 'clave-que-no-debe-salir';

const equipo = (host: string, puerto: number): EquipoRegistrado =>
  ({
    dispositivoId: 'e0000000-0000-4000-8000-000000000001',
    tipo: 'intercom',
    host,
    puerto: 80,
    protocolo: 'http',
    usuario: 'servicio',
    clave: CLAVE,
    canalDeVideo: '102',
    puertoRtsp: puerto,
  }) as unknown as EquipoRegistrado;

const registrar = (puente: Go2rtcDePruebas, metodo: 'PUT' | 'PATCH', nombre: string, src: string) =>
  fetch(`${puente.url}/api/streams?${new URLSearchParams({ name: nombre, src }).toString()}`, {
    method: metodo,
  });

const negociar = async (puente: Go2rtcDePruebas, nombre: string) => {
  const r = await fetch(`${puente.url}/api/webrtc?${new URLSearchParams({ src: nombre })}`, {
    method: 'POST',
    headers: { 'content-type': 'application/sdp', accept: 'application/sdp' },
    body: OFERTA_SDP_DE_PRUEBA,
    signal: AbortSignal.timeout(15_000),
  });
  return { estado: r.status, cuerpo: await r.text() };
};

describe.skipIf(binario === null)(
  `go2rtc real (${binario === null ? OMITIDA_SIN_BINARIO : 'binario de GO2RTC_BIN'})`,
  () => {
    let puente: Go2rtcDePruebas | null = null;
    let camara: ServidorRtspSimulado | null = null;
    afterEach(async () => {
      await puente?.cerrar();
      await camara?.cerrar();
      puente = null;
      camara = null;
    });

    it('con `streams: {}` el PUT falla con «did not find expected key»; el PATCH no persiste', async () => {
      puente = await arrancarGo2rtc(binario ?? '', ['streams: {}']);
      const src = `rtsp://servicio:${CLAVE}@127.0.0.1:1/Streaming/Channels/102`;
      const put = await registrar(puente, 'PUT', 'ncr-put', src);
      expect(put.status).toBe(400);
      expect(await put.text()).toMatch(/did not find expected key/);

      const patch = await registrar(puente, 'PATCH', 'ncr-patch', src);
      expect(patch.status).toBe(200);
      expect(puente.yaml()).toContain('streams: {}');
      expect(puente.yaml()).not.toContain(CLAVE);
      expect(puente.yaml()).not.toMatch(/rtsp:\/\//);
      const lista = await (await fetch(`${puente.url}/api/streams`)).text();
      expect(lista).toContain('ncr-patch');
      expect(lista).not.toContain(CLAVE);
    });

    it('sin #backchannel=0 el equipo cierra (HTTP 500 · EOF); con él, hay SDP', async () => {
      puente = await arrancarGo2rtc(binario ?? '');
      camara = await servidorRtspSimulado({
        usuario: 'servicio',
        clave: CLAVE,
        canales: { '102': 'H264' },
        cerrarSiPideBackchannel: true,
        rechazaReconexionMs: 700,
      });
      const conCorreccion = origenRtspDe(equipo('127.0.0.1', camara.puerto), camara.puerto);
      expect(conCorreccion).not.toBeNull();
      const src = conCorreccion?.rtsp ?? '';
      expect(src).toMatch(/#backchannel=0$/);
      const sinCorreccion = src.replace(/#backchannel=0$/, '');

      expect((await registrar(puente, 'PATCH', 'ncr-sin', sinCorreccion)).status).toBe(200);
      const fallo = await negociar(puente, 'ncr-sin');
      expect(fallo.estado).toBe(500);
      expect(fallo.cuerpo).toMatch(/EOF/);
      // El puente pidió el canal de retorno, el equipo cerró, y el reintento
      // inmediato también se cerró: eso es lo que se vio en sitio.
      expect(camara.describesConBackchannel()).toBe(1);
      expect(camara.metodos()).not.toContain('SETUP');
      await new Promise((listo) => setTimeout(listo, 800));

      expect((await registrar(puente, 'PATCH', 'ncr-con', src)).status).toBe(200);
      const inicio = Date.now();
      const exito = await negociar(puente, 'ncr-con');
      const tardo = Date.now() - inicio;
      expect(exito.estado, exito.cuerpo).toBeLessThan(300);
      expect(exito.cuerpo.startsWith('v=0')).toBe(true);
      // Ni un DESCRIBE con backchannel más: la corrección evita la conexión cerrada.
      expect(camara.describesConBackchannel()).toBe(1);
      expect(camara.metodos()).toContain('SETUP');
      expect(camara.metodos()).toContain('PLAY');
      // Sin STUN la respuesta llega enseguida (KPI-33): con el STUN por omisión tardaba 5 s.
      expect(tardo).toBeLessThan(3000);
      expect(puente.yaml()).not.toContain(CLAVE);
      expect(exito.cuerpo).not.toContain(CLAVE);
    }, 30_000);
  },
);

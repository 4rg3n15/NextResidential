import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
import { codecDelSdp, describirRtsp } from './rtsp-describe';
import { servidorRtspSimulado } from '../simulacion/servidor-rtsp';
import type { ServidorRtspSimulado } from '../simulacion/servidor-rtsp';

/**
 * D2 · C3 (ETAPA 15-L) · el códec se le pregunta al equipo por RTSP, con una
 * sola tentativa autenticada. Contra un equipo simulado en el bucle local.
 */
describe('codecDelSdp', () => {
  it('lee el códec del bloque de VIDEO, no el del audio', () => {
    const sdp =
      'v=0\r\nm=audio 0 RTP/AVP 0\r\na=rtpmap:0 PCMU/8000\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 H265/90000\r\n';
    expect(codecDelSdp(sdp)).toBe('H.265');
  });

  it.each([
    ['H264', 'H.264'],
    ['HEVC', 'H.265'],
    ['JPEG', 'MJPEG'],
    ['VP8', 'VP8'],
  ])('%s → %s', (nombre, codec) => {
    expect(codecDelSdp(`m=video 0 RTP/AVP 96\na=rtpmap:96 ${nombre}/90000`)).toBe(codec);
  });

  it('sin video o sin rtpmap, no se inventa un códec', () => {
    expect(codecDelSdp('m=audio 0 RTP/AVP 0\na=rtpmap:0 PCMU/8000')).toBeNull();
    expect(codecDelSdp('m=video 0 RTP/AVP 96\na=control:x\nm=audio 0 RTP/AVP 0')).toBeNull();
  });
});

describe('describirRtsp contra el equipo simulado', () => {
  let equipo: ServidorRtspSimulado;
  beforeAll(async () => {
    equipo = await servidorRtspSimulado({
      usuario: 'servicio',
      clave: 'clave-de-prueba',
      canales: { '102': 'H264', '101': 'H265' },
    });
  });
  afterAll(async () => {
    await equipo.cerrar();
  });

  const describir = (camino: string, clave = 'clave-de-prueba') =>
    describirRtsp({
      host: '127.0.0.1',
      puerto: equipo.puerto,
      camino,
      usuario: 'servicio',
      clave,
      tiempoLimiteMs: 2000,
    });

  it('el subflujo en H.264: se ve en el navegador', async () => {
    expect(await describir('/Streaming/Channels/102')).toMatchObject({
      clase: 'respondio',
      estado: 200,
      codec: 'H.264',
    });
  });

  it('el principal en H.265: se dice, no se deja en negro', async () => {
    expect((await describir('/Streaming/Channels/101')).codec).toBe('H.265');
  });

  it('un canal que el equipo no tiene: rechazo con su código', async () => {
    expect(await describir('/Streaming/Channels/202')).toMatchObject({
      clase: 'rechazo',
      estado: 404,
    });
  });

  it('la clave mala se prueba UNA vez: dos peticiones y ninguna más', async () => {
    const antes = equipo.peticiones();
    expect((await describir('/Streaming/Channels/102', 'otra')).clase).toBe('credencial');
    expect(equipo.peticiones() - antes).toBe(2);
  });

  it('un puerto que no contesta: inalcanzable, no un error', async () => {
    const cerrado = createServer();
    await new Promise<void>((listo) => cerrado.listen(0, '127.0.0.1', listo));
    const puerto = (cerrado.address() as AddressInfo).port;
    await new Promise<void>((listo) => cerrado.close(() => listo()));
    const r = await describirRtsp({
      host: '127.0.0.1',
      puerto,
      camino: '/Streaming/Channels/102',
      usuario: 'u',
      clave: 'c',
      tiempoLimiteMs: 1000,
    });
    expect(r.clase).toBe('inalcanzable');
  });

  it('un equipo que acepta la conexión y calla: inalcanzable por plazo', async () => {
    const abiertas: Socket[] = [];
    const mudo = createServer((s) => void abiertas.push(s));
    await new Promise<void>((listo) => mudo.listen(0, '127.0.0.1', listo));
    const r = await describirRtsp({
      host: '127.0.0.1',
      puerto: (mudo.address() as AddressInfo).port,
      camino: '/Streaming/Channels/102',
      usuario: 'u',
      clave: 'c',
      tiempoLimiteMs: 200,
    });
    expect(r).toMatchObject({ clase: 'inalcanzable', detalle: expect.stringMatching(/200 ms/) });
    for (const s of abiertas) s.destroy();
    await new Promise<void>((listo) => mudo.close(() => listo()));
  });
});

// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, request } from 'node:http';
import type { IncomingHttpHeaders, IncomingMessage, Server } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { RUTA_DEL_AUDIO_EN_LA_CONSOLA, reenviarAudio } from '../../reenvio-de-audio.mjs';

/**
 * 15-P · el reenvío del WebSocket del audio en `servidor.mjs`, sin Next ni
 * API: una «API» que contesta la actualización como quiera y una «consola»
 * que reenvía. Se comprueba qué pasa y qué NO pasa a la API.
 */
const servidores: Server[] = [];
const sockets = new Set<Socket>();
afterEach(async () => {
  // Los sockets actualizados ya no son del servidor HTTP: se cierran a mano.
  for (const s of sockets) s.destroy();
  sockets.clear();
  for (const s of servidores.splice(0)) await new Promise((r) => s.close(() => r(null)));
});

const escuchar = async (s: Server): Promise<number> => {
  servidores.push(s);
  s.on('connection', (c: Socket) => sockets.add(c));
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  return (s.address() as AddressInfo).port;
};

/** Una «API» que acepta (101 con eco) o rechaza (401) la actualización. */
const api = async (acepta: boolean) => {
  const vistas: { url: string; cabeceras: IncomingHttpHeaders }[] = [];
  const s = createServer();
  s.on('upgrade', (p: IncomingMessage, socket: Socket) => {
    vistas.push({ url: p.url ?? '', cabeceras: p.headers });
    if (!acepta) {
      socket.end('HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: aceptado\r\n\r\n',
    );
    socket.on('data', (d) => socket.write(d));
  });
  return { puerto: await escuchar(s), vistas };
};

const consola = async (apiUrl: string) => {
  const s = createServer();
  s.on('upgrade', (p: IncomingMessage, socket: Socket, cabeza: Buffer) =>
    reenviarAudio(p, socket, cabeza, { apiUrl, ip: '192.0.2.44' }),
  );
  return escuchar(s);
};

const actualizar = (puerto: number, ruta: string) =>
  new Promise<{ estado: number; socket: Socket | null; cabeceras: IncomingHttpHeaders }>(
    (listo) => {
      const p = request({
        host: '127.0.0.1',
        port: puerto,
        path: ruta,
        headers: {
          connection: 'Upgrade',
          upgrade: 'websocket',
          'sec-websocket-key': 'clave-del-protocolo',
          'sec-websocket-version': '13',
          cookie: 'ncr_acceso=token-de-sesion',
          authorization: 'Bearer token-de-sesion',
        },
      });
      p.on('upgrade', (r, socket) =>
        listo({ estado: r.statusCode ?? 0, socket, cabeceras: r.headers }),
      );
      p.on('response', (r) =>
        listo({ estado: r.statusCode ?? 0, socket: null, cabeceras: r.headers }),
      );
      p.end();
    },
  );

describe('15-P · reenvío del WebSocket del audio (servidor.mjs)', () => {
  it('pasa a la API sólo el billete, el protocolo y la IP; el audio va y vuelve tal cual', async () => {
    const { puerto, vistas } = await api(true);
    const delaConsola = await consola(`http://127.0.0.1:${String(puerto)}`);
    const r = await actualizar(delaConsola, `${RUTA_DEL_AUDIO_EN_LA_CONSOLA}?billete=abc&otra=x`);
    expect(r.estado).toBe(101);
    expect(r.cabeceras['sec-websocket-accept']).toBe('aceptado');
    expect(vistas[0]?.url).toBe('/guardia/audio?billete=abc');
    const vistasCabeceras = vistas[0]?.cabeceras ?? {};
    expect(vistasCabeceras['x-forwarded-for']).toBe('192.0.2.44');
    expect(vistasCabeceras['sec-websocket-key']).toBe('clave-del-protocolo');
    // Ni la cookie ni el token de la sesión llegan a la API por aquí.
    expect(vistasCabeceras.cookie).toBeUndefined();
    expect(vistasCabeceras.authorization).toBeUndefined();
    const eco = new Promise<string>((listo) => r.socket?.once('data', (d) => listo(String(d))));
    r.socket?.write('trama');
    expect(await eco).toBe('trama');
    r.socket?.destroy();
  });

  it('un rechazo de la API (billete gastado) llega al navegador con su código', async () => {
    const { puerto } = await api(false);
    const delaConsola = await consola(`http://127.0.0.1:${String(puerto)}`);
    expect(
      (await actualizar(delaConsola, `${RUTA_DEL_AUDIO_EN_LA_CONSOLA}?billete=gastado`)).estado,
    ).toBe(401);
  });

  it('sin API alcanzable, 502', async () => {
    const delaConsola = await consola('http://127.0.0.1:9');
    expect((await actualizar(delaConsola, RUTA_DEL_AUDIO_EN_LA_CONSOLA)).estado).toBe(502);
  });

  it('una API_URL que no es una URL, 502', async () => {
    const delaConsola = await consola('no-es-una-url');
    expect((await actualizar(delaConsola, RUTA_DEL_AUDIO_EN_LA_CONSOLA)).estado).toBe(502);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request as pedirHttp } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { crearApp, crearFirmante } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · D2 · EL AUDIO DIRECTO SÓLO DESDE LA CONSOLA
 *
 * Con la consola en Netlify (P-20) el navegador abre el WebSocket del audio
 * contra la API. Un WebSocket NO pasa por CORS: cualquier página podría
 * intentarlo. La puerta rechaza con 403 un `Origin` que no esté en la lista
 * blanca ANTES de mirar el billete; sin `Origin` (el reenvío de `servidor.mjs`
 * en sitio) decide el billete, como en la 15-P.
 * ═════════════════════════════════════════════════════════════════════════════
 */
let app: INestApplication;
let puerto = 0;

/** La respuesta de una petición de actualización: el código de estado. */
const actualizar = (cabeceras: Record<string, string>): Promise<number> =>
  new Promise((listo, mal) => {
    const r = pedirHttp({
      host: '127.0.0.1',
      port: puerto,
      path: '/guardia/audio?billete=audio.inventado',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...cabeceras,
      },
    });
    r.on('response', (res) => {
      listo(res.statusCode ?? 0);
      res.resume();
    });
    r.on('upgrade', (res, socket) => {
      socket.destroy();
      listo(res.statusCode ?? 0);
    });
    r.on('error', mal);
    r.end();
  });

beforeAll(async () => {
  app = await crearApp(await crearFirmante());
  puerto = ((app.getHttpServer() as Server).address() as AddressInfo).port;
});
afterAll(async () => {
  await app?.close();
});

describe('D2 · el Origin del WebSocket de audio', () => {
  it('desde otra página: 403, sin llegar a mirar el billete', async () => {
    expect(await actualizar({ Origin: 'https://pagina-ajena.invalid' })).toBe(403);
  });

  it('desde la consola (lista blanca) con billete inválido: 401, decide el billete', async () => {
    expect(await actualizar({ Origin: 'https://consola.invalid' })).toBe(401);
  });

  it('sin Origin (reenvío de la consola en sitio): 401, decide el billete', async () => {
    expect(await actualizar({})).toBe(401);
  });
});

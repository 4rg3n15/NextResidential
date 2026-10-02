import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { atenderActualizacion } from './despachador-de-actualizaciones';

/** 15-Q2 · un dueño por ruta de WebSocket; lo que no tiene dueño, 404. */
const servidores: ReturnType<typeof createServer>[] = [];
afterEach(() => {
  for (const s of servidores.splice(0)) s.close();
});

const pedirActualizacion = (puerto: number, ruta: string): Promise<string> =>
  new Promise((resolver) => {
    const socket = connect(puerto, '127.0.0.1', () =>
      socket.write(
        `GET ${ruta} HTTP/1.1\r\nHost: x\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
      ),
    );
    let datos = '';
    socket.on('data', (d) => (datos += d.toString()));
    socket.on('close', () => resolver(datos));
  });

describe('despachador de actualizaciones (15-Q2)', () => {
  it('reparte por ruta exacta, responde 404 a lo demás y no admite dos dueños', async () => {
    const servidor = createServer();
    servidores.push(servidor);
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', r));
    const puerto = (servidor.address() as AddressInfo).port;
    const vistas: string[] = [];
    const soltar = atenderActualizacion(servidor, '/a', (_p, socket, _c, url) => {
      vistas.push(url.pathname);
      socket.end('HTTP/1.1 418 Teapot\r\nContent-Length: 0\r\n\r\n');
    });
    expect(() => atenderActualizacion(servidor, '/a', () => undefined)).toThrow('ya tiene dueño');
    expect(await pedirActualizacion(puerto, '/a?x=1')).toContain('418');
    expect(await pedirActualizacion(puerto, '/b')).toContain('404 Not Found');
    soltar();
    expect(await pedirActualizacion(puerto, '/a')).toContain('404 Not Found');
    expect(vistas).toEqual(['/a']);
  });
});

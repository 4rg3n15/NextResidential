import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MENSAJE_ARRANCANDO, abrirPuertoMientrasArranca } from './puerto-mientras-arranca';
import type { PuertoDeArranque } from './puerto-mientras-arranca';

/**
 * Otros fallos (15-M) · mientras la API construye sus módulos, su puerto dice
 * «503, vuelva en unos segundos» en vez de rechazar la conexión, que la
 * consola no distinguía de una API apagada.
 */
const puertoLibre = async (): Promise<number> =>
  new Promise((listo) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => listo(port));
    });
  });

const abiertos: PuertoDeArranque[] = [];
afterEach(async () => {
  await Promise.all(abiertos.splice(0).map((p) => p.cerrar()));
});

describe('abrirPuertoMientrasArranca', () => {
  it('contesta 503 con Retry-After y un motivo legible, a cualquier ruta y método', async () => {
    const puerto = await puertoLibre();
    const abierto = await abrirPuertoMientrasArranca(puerto);
    expect(abierto).not.toBeNull();
    if (abierto !== null) abiertos.push(abierto);

    for (const [ruta, metodo] of [
      ['/health', 'GET'],
      ['/copropiedades/x/eventos', 'POST'],
    ] as const) {
      const r = await fetch(`http://127.0.0.1:${String(puerto)}${ruta}`, { method: metodo });
      expect(r.status).toBe(503);
      expect(r.headers.get('retry-after')).toBe('2');
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(await r.json()).toEqual({
        estado: 503,
        correlacion: 'api-arrancando',
        mensaje: MENSAJE_ARRANCANDO,
      });
    }
  });

  it('al cerrarse deja el puerto libre para la API de verdad', async () => {
    const puerto = await puertoLibre();
    const abierto = await abrirPuertoMientrasArranca(puerto);
    expect(abierto).not.toBeNull();
    // Una conexión viva (keep-alive) no puede retener el puerto.
    await fetch(`http://127.0.0.1:${String(puerto)}/`, { keepalive: true });
    await abierto?.cerrar();

    const real = createServer((_q, r) => r.end('ok'));
    await new Promise<void>((listo) => real.listen(puerto, listo));
    const r = await fetch(`http://127.0.0.1:${String(puerto)}/`);
    expect(await r.text()).toBe('ok');
    await new Promise<void>((listo) => {
      real.closeAllConnections();
      real.close(() => listo());
    });
  });

  it('si el puerto está ocupado no insiste: devuelve null y el listen de Nest dirá por qué', async () => {
    const ocupante = createServer();
    await new Promise<void>((listo) => ocupante.listen(0, listo));
    const { port } = ocupante.address() as AddressInfo;

    expect(await abrirPuertoMientrasArranca(port)).toBeNull();
    await new Promise<void>((listo) => ocupante.close(() => listo()));
  });
});

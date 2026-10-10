import { afterEach, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createServer } from 'node:net';
import type { AddressInfo, Server as NetServer } from 'node:net';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { crearApp, crearFirmante } from './utilidades';

/**
 * DT-15X-07 · H-15S5-07 · LOS SERVIDORES DE PRUEBA ESCUCHAN EN 127.0.0.1
 *
 * `equipos.e2e` cayó dos veces con «socket hang up» (`socketOnEnd`), las dos en
 * macOS y en el paso 7, con los ficheros en paralelo. `crearApp` escuchaba en
 * la comodín (`0.0.0.0` o `::`) y los dobles —el proxy de `pgboss-y-sonda-ante-
 * cortes`, el del push, los simulados— en `127.0.0.1:0`. En BSD, con
 * `SO_REUSEADDR` (libuv lo pone), una dirección concreta puede quedarse el
 * MISMO puerto que una comodín de otro proceso, y la conexión a `127.0.0.1:P`
 * va a la concreta: la petición de `supertest` llega al doble, que la cierra
 * sin responder. Linux no lo permite, y por eso aquí nunca salió.
 *
 * Con todos en `127.0.0.1`, el núcleo ve el choque y no repite el puerto.
 */
describe('DT-15X-07 · ningún servidor de prueba de la API escucha en la dirección comodín', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it('crearApp escucha en 127.0.0.1, no en la comodín', async () => {
    app = await crearApp(await crearFirmante());
    const { address } = (app.getHttpServer() as Server).address() as AddressInfo;
    expect(address).toBe('127.0.0.1');
  });

  it('el peligro, medido: en macOS 127.0.0.1 comparte puerto con una comodín; en Linux, no', async () => {
    const escuchar = (puerto: number, host?: string): Promise<NetServer> =>
      new Promise((listo, mal) => {
        const s = createServer().once('error', mal);
        s.listen(puerto, ...(host === undefined ? [] : [host]), () => listo(s));
      });
    const comodin = await escuchar(0);
    const { port } = comodin.address() as AddressInfo;
    const concreta = await escuchar(port, '127.0.0.1').catch((e: { code?: string }) => e.code);
    if (typeof concreta === 'object') concreta.close();
    comodin.close();
    expect(typeof concreta === 'object' ? 'comparte' : concreta).toBe(
      process.platform === 'darwin' ? 'comparte' : 'EADDRINUSE',
    );
  });

  it('ningún `listen(0…)` de apps/api/test deja fuera el 127.0.0.1', () => {
    const dir = __dirname;
    const ficheros = (readdirSync(dir, { recursive: true }) as string[])
      .filter((f) => f.endsWith('.ts'))
      .map((f) => join(dir, f));
    const comodines = ficheros.flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((linea, i) => ({ linea, donde: `${relative(dir, f)}:${String(i + 1)}` }))
        .filter(({ linea }) => !/^\s*(\*|\/\/)/.test(linea))
        .filter(({ linea }) => /\.listen\(\s*0\b/.test(linea) && !linea.includes("'127.0.0.1'"))
        .map(({ donde }) => donde),
    );
    expect(comodines).toEqual([]);
  });
});

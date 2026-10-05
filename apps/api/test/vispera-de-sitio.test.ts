import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { join, resolve } from 'node:path';
import {
  comprobacionesDeLaVispera,
  lineasDeLaConsola,
  lineasDeMigraciones,
  migracionesDeLaVispera,
} from '../../../scripts/lib/vispera-de-sitio.mjs';
import {
  API_COMPLETA,
  CONSOLA_DE_SITIO,
  IP_DE_LA_RED,
  borrarRepositorios,
  repositorio,
  sinValoresNiIps,
} from './dobles/entornos-de-la-vispera';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-S1 · A2 · LO QUE `pnpm sitio:ensayo` AÑADE PARA LA VÍSPERA
 *
 * Cada aviso nuevo, provocado con lo que lo dispara —una base que no tiene
 * migraciones o no deja leer el registro de la CLI, una consola que no contesta
 * o no reenvía el audio— y sin hardware ni base real; las variables, en
 * `vispera-variables.test.ts`. Y en todos, lo mismo: ninguna línea lleva un
 * valor de los .env ni una IP de la red.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const MIGRACIONES = resolve(__dirname, '../../../supabase/migrations');

const servidores: Server[] = [];
const sockets: Duplex[] = [];
afterEach(async () => {
  borrarRepositorios();
  for (const s of sockets.splice(0)) s.destroy();
  await Promise.all(
    servidores.splice(0).map((s) => {
      s.closeAllConnections();
      return new Promise((r) => s.close(r));
    }),
  );
});

/** Una base de mentira: registro de la CLI con estas versiones, o que no se deja leer. */
const base = (registro: readonly string[] | null, huellas: readonly string[] = []) => ({
  query: async (sql: string, parametros: readonly unknown[] = []) => {
    if (sql.includes('supabase_migrations')) {
      if (registro === null) throw new Error('permission denied for schema supabase_migrations');
      return { rows: registro.map((version) => ({ version })) };
    }
    const hay = parametros.some((p) => typeof p === 'string' && huellas.includes(p));
    return { rows: hay ? [{ '?column?': 1 }] : [] };
  },
});

describe('15-S1 · A2 · migraciones 0047–0054 contra la base, una a una y con su nombre', () => {
  it('por el registro de la CLI: dice cuáles faltan, con su nombre, y el remedio', async () => {
    const m = await migracionesDeLaVispera(
      base(['20261001120000', '20261001130000', '20261002120000', '20261003120000']),
      MIGRACIONES,
    );
    const lineas = lineasDeMigraciones(m);
    expect(lineas[0]).toMatch(/por el registro de la CLI/);
    expect(lineas).toContain('  ✓ 0047 conversaciones_de_guardia');
    expect(lineas).toContain('  ✗ 0051 estado_que_sobrevive_al_reinicio');
    expect(lineas).toContain('  ✗ 0054 usuarios_lectura_servicio');
    expect(lineas.at(-1)).toMatch(/faltan 4 de 8: supabase db push y reinicie la API/);
  });

  it('sin permiso sobre el registro de la CLI, por la huella de cada una en el catálogo', async () => {
    const m = await migracionesDeLaVispera(
      base(null, [
        'conversaciones_de_guardia',
        'tg_version_reglas_monotona',
        'usuarios_lectura_servicio',
      ]),
      MIGRACIONES,
    );
    const lineas = lineasDeMigraciones(m);
    expect(lineas[0]).toMatch(/por su huella/);
    expect(lineas).toContain('  ✓ 0047 conversaciones_de_guardia');
    expect(lineas).toContain('  ✗ 0048 salidas_del_videoportero');
    expect(lineas).toContain('  ✓ 0049 edge_en_sitio');
    expect(lineas).toContain('  ✓ 0054 usuarios_lectura_servicio');
    expect(lineas.at(-1)).toMatch(/faltan 5 de 8/);
  });

  it('con las ocho, lo dice en una línea', async () => {
    const todas = ['20261001120000', '20261001130000', '20261002120000', '20261003120000'];
    todas.push('20261004120000', '20261004130000', '20261004140000', '20261004150000');
    expect(lineasDeMigraciones(await migracionesDeLaVispera(base(todas), MIGRACIONES)).at(-1)).toBe(
      '  ✓ están las ocho',
    );
  });
});

/** Una consola de mentira: contesta al GET y, a la actualización del audio, lo que se pida. */
const consola = async (alAudio: ((socket: Duplex) => void) | null) => {
  const s = createServer((_peticion, respuesta) => {
    respuesta.writeHead(200);
    respuesta.end('consola');
  });
  if (alAudio !== null)
    s.on('upgrade', (_p, socket: Duplex) => {
      sockets.push(socket);
      alAudio(socket);
    });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  servidores.push(s);
  return `http://127.0.0.1:${String((s.address() as AddressInfo).port)}`;
};
const contestar = (estado: string) => (socket: Duplex) => {
  socket.write(`HTTP/1.1 ${estado}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
};
/** Lo que nunca debe pasar: algo acepta el billete inventado y cambia de protocolo. */
const aceptar = (socket: Duplex) => {
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n',
  );
};
/** Un puerto que nadie escucha: el de un servidor que se cierra en el acto. */
const puertoCerrado = async () => {
  const origen = await consola(null);
  await new Promise((r) => servidores.pop()?.close(r));
  return origen;
};

describe('15-S1 · A2 · la consola de la guardia: contexto seguro y reenvío del audio', () => {
  it('servida por servidor.mjs ante la API: el billete inventado vuelve con 401 y está bien', async () => {
    const lineas = await lineasDeLaConsola(await consola(contestar('401 Unauthorized')));
    expect(lineas[1]).toBe(
      '  ✓ contesta por el bucle local y reenvía el audio a la API (servidor.mjs)',
    );
    expect(lineas[2]).toMatch(
      /SÓLO en el propio Mac por http:\/\/127\.0\.0\.1:\d+: por la IP del Mac/,
    );
  });

  it('cada fallo con su remedio: API inalcanzable, audio por HTTP, next start, nadie escucha', async () => {
    expect((await lineasDeLaConsola(await consola(contestar('502 Bad Gateway'))))[1]).toMatch(
      /✗ la consola no llega a la API con el audio → API_URL/,
    );
    expect((await lineasDeLaConsola(await consola(contestar('404 Not Found'))))[1]).toMatch(
      /✗ la API no atiende el audio por WebSocket → GUARDIA_AUDIO_TRANSPORTE=websocket/,
    );
    expect((await lineasDeLaConsola(await consola(null)))[1]).toMatch(
      /✗ la consola no reenvía el audio → arránquela con pnpm --filter @ncr\/web start, no con next start/,
    );
    expect((await lineasDeLaConsola(await consola(aceptar)))[1]).toMatch(
      /✗ algo aceptó un billete inventado/,
    );
    const nadie = await lineasDeLaConsola(await puertoCerrado());
    expect(nadie[1]).toMatch(
      /✗ la consola no contesta en http:\/\/127\.0\.0\.1:\d+ → pnpm --filter @ncr\/web start/,
    );
    expect(nadie).toHaveLength(2);
  });
});

describe('15-S1 · A2 · el ensayo: las del Mac de siempre y, detrás, las de la víspera', () => {
  it('compone las tres y no imprime ningún valor; una base ilegible se dice sin su error', async () => {
    const r = repositorio(API_COMPLETA, { '.env': CONSOLA_DE_SITIO });
    mkdirSync(join(r.raiz, 'supabase/migrations'), { recursive: true });
    const dicho: string[] = [];
    await comprobacionesDeLaVispera({
      pool: {
        query: async () => {
          throw new Error(`connect ECONNREFUSED ${IP_DE_LA_RED}:5432`);
        },
      } as never,
      decir: (l) => dicho.push(l),
      raiz: r.raiz,
      rutaEnv: r.rutaEnv,
      consola: await consola(contestar('401 Unauthorized')),
    });
    const secciones = dicho.filter((l) => l.startsWith('──'));
    expect(secciones).toHaveLength(3);
    expect(secciones[0]).toBe('── Comprobaciones del Mac');
    expect(secciones[1]).toMatch(/^── La víspera · variables nuevas desde la 15-N/);
    expect(secciones[2]).toMatch(/^── La víspera · la consola de la guardia/);
    expect(dicho).toContain('  ✗ no se pudieron leer las migraciones 0047–0054 de la base');
    // Las del Mac de siempre enseñan la IP del Mac a propósito (la del iPhone); las nuevas, no.
    const nuevas = dicho.slice(
      dicho.indexOf('  ✗ no se pudieron leer las migraciones 0047–0054 de la base'),
    );
    sinValoresNiIps(nuevas);
  }, 20_000);
});

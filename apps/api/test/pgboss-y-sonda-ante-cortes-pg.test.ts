import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { createServer, connect } from 'node:net';
import type { Server, Socket } from 'node:net';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import type { Bitacora } from '@ncr/domain-core';
import {
  NOMBRE_DE_APLICACION_DE_PGBOSS,
  PlanificadorPgBoss,
} from '../src/planificacion/infraestructura/planificador-pgboss';
import { SondaDePostgresPg } from '../src/arranque/sonda-postgres';
import { vigilarPool } from '../src/persistencia/con-cliente';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-O · pg-boss Y LA SONDA DE `/ready` ANTE UN CORTE, CONTRA POSTGRESQL REAL
 *
 *  · pg-boss en marcha pierde sus conexiones (`pg_terminate_backend`): sigue
 *    vivo, lo anota, y el siguiente trabajo encolado SE EJECUTA.
 *  · pg-boss que no puede arrancar (la base no acepta conexiones) se reintenta
 *    solo y arranca cuando la base vuelve, sin reiniciar la API. La base se
 *    «apaga» con un proxy TCP delante del PostgreSQL de pruebas.
 *  · la sonda de `/ready` mira EL POOL de la API: agotado sin esperar en su
 *    cola, un corte ya repuesto como aviso, y la base inalcanzable por clase.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CORRIDA = randomBytes(4).toString('hex');

const bitacora = (): Bitacora & { lineas: { nivel: string; mensaje: string }[] } => {
  const lineas: { nivel: string; mensaje: string }[] = [];
  return {
    lineas,
    registrar: (nivel: string, mensaje: string) => void lineas.push({ nivel, mensaje }),
  } as unknown as Bitacora & { lineas: { nivel: string; mensaje: string }[] };
};

const esperarA = async (
  condicion: () => boolean | Promise<boolean>,
  ms = 15_000,
): Promise<void> => {
  const limite = Date.now() + ms;
  while (!(await condicion())) {
    if (Date.now() > limite) throw new Error('no se cumplió a tiempo');
    await new Promise((r) => setTimeout(r, 100));
  }
};

let admin: Pool | undefined;

beforeAll(() => {
  if (URL_BASE === undefined) return;
  admin = new Pool({ connectionString: URL_BASE, max: 2 });
  admin.on('error', () => undefined);
});
afterAll(async () => {
  await admin?.end();
});

/** Un proxy TCP delante de PostgreSQL que se puede «apagar» y «encender». */
const proxyDeLaBase = async (destino: URL) => {
  let aceptar = false;
  const abiertos = new Set<Socket>();
  const servidor: Server = createServer((entrada) => {
    if (!aceptar) {
      entrada.destroy();
      return;
    }
    const salida = connect(Number(destino.port || 5432), destino.hostname);
    abiertos.add(entrada).add(salida);
    const cerrar = (): void => {
      entrada.destroy();
      salida.destroy();
    };
    entrada.on('error', cerrar).on('close', cerrar);
    salida.on('error', cerrar).on('close', cerrar);
    entrada.pipe(salida).pipe(entrada);
  });
  await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
  const direccion = servidor.address();
  const puerto = typeof direccion === 'object' && direccion !== null ? direccion.port : 0;
  const url = new URL(destino.toString());
  url.hostname = '127.0.0.1';
  url.port = String(puerto);
  return {
    url: url.toString(),
    encender: () => {
      aceptar = true;
    },
    cerrar: async () => {
      for (const s of abiertos) s.destroy();
      await new Promise<void>((listo) => servidor.close(() => listo()));
    },
  };
};

describe.skipIf(URL_BASE === undefined)('15-O · pg-boss ante un corte (PostgreSQL real)', () => {
  exigirBase('sin DATABASE_URL_PRUEBAS', () => admin !== undefined);
  const esquemas: string[] = [];
  let planificador: PlanificadorPgBoss | undefined;

  afterEach(async () => {
    await planificador?.detener();
    planificador = undefined;
  });
  afterAll(async () => {
    for (const e of esquemas) await admin?.query(`DROP SCHEMA IF EXISTS ${e} CASCADE`);
  });

  it('en marcha, pierde sus conexiones: sigue vivo, lo anota y el siguiente trabajo se ejecuta', async () => {
    const esquema = `pgboss_corte_${CORRIDA}`;
    esquemas.push(esquema);
    const ejecutados: string[] = [];
    const registro = bitacora();
    planificador = new PlanificadorPgBoss({
      cadenaDeConexion: URL_BASE as string,
      esquema,
      bitacora: registro,
    });
    planificador.atender({
      nombre: 'prueba-corte',
      descripcion: 'marca que se ejecutó',
      ejecutar: async (datos) => {
        ejecutados.push(datos.marca ?? '');
        return {};
      },
    });
    await planificador.arrancar();
    expect(planificador.estado().fase).toBe('en-marcha');
    // 15-P · 0.6 · el pool propio de pg-boss también pide TCP keepalive.
    const motor = (planificador as unknown as { boss: { getDb: () => { pool: Pool } } }).boss;
    expect(
      (motor.getDb().pool as Pool & { options: { keepAlive?: boolean } }).options.keepAlive,
    ).toBe(true);

    const { rowCount } = await (admin as Pool).query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE application_name = $1 AND pid <> pg_backend_pid()`,
      [NOMBRE_DE_APLICACION_DE_PGBOSS],
    );
    expect(rowCount).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 300));

    // Encolar puede toparse con el corte una vez; pg-boss reabre en la siguiente.
    await esperarA(async () => {
      try {
        return await (planificador as PlanificadorPgBoss).encolar('prueba-corte', {
          marca: 'tras-el-corte',
        });
      } catch {
        return false;
      }
    });
    await esperarA(() => ejecutados.includes('tras-el-corte'));
    expect(planificador.estado().fase).toBe('en-marcha');
    expect(planificador.estado().ultimoError?.categoria).toMatch(/cortó la conexión|error/);
  }, 40_000);

  it('no puede arrancar: se reintenta solo, lo publica, y arranca cuando la base vuelve', async () => {
    const esquema = `pgboss_reintento_${CORRIDA}`;
    esquemas.push(esquema);
    const proxy = await proxyDeLaBase(new URL(URL_BASE as string));
    const registro = bitacora();
    try {
      planificador = new PlanificadorPgBoss({
        cadenaDeConexion: proxy.url,
        esquema,
        bitacora: registro,
        reintento: { primeraEsperaMs: 100, esperaMaximaMs: 400 },
      });
      await expect(planificador.arrancar()).rejects.toThrow();
      const estado = planificador.estado();
      expect(estado.fase).toBe('reintentando');
      expect(estado.motivo).toMatch(/intento 1, el siguiente en/);
      expect(estado.motivo).not.toMatch(/127\.0\.0\.1|postgres(ql)?:\/\//);

      await esperarA(() => /intento [3-9]/.test(planificador?.estado().motivo ?? ''));
      proxy.encender();
      await esperarA(() => planificador?.estado().fase === 'en-marcha', 20_000);
      expect(registro.lineas.map((l) => l.mensaje)).toContain(
        'el planificador arrancó tras reintentar',
      );
    } finally {
      await planificador?.detener();
      planificador = undefined;
      await proxy.cerrar();
    }
  }, 40_000);

  it('detenido mientras reintenta: no vuelve a intentarlo', async () => {
    const proxy = await proxyDeLaBase(new URL(URL_BASE as string));
    try {
      planificador = new PlanificadorPgBoss({
        cadenaDeConexion: proxy.url,
        esquema: `pgboss_parado_${CORRIDA}`,
        bitacora: bitacora(),
        reintento: { primeraEsperaMs: 50, esperaMaximaMs: 50 },
      });
      await expect(planificador.arrancar()).rejects.toThrow();
      await planificador.detener();
      expect(planificador.estado().fase).toBe('detenido');
      proxy.encender();
      await new Promise((r) => setTimeout(r, 400));
      expect(planificador.estado().fase).toBe('detenido');
    } finally {
      await proxy.cerrar();
    }
  });
});

describe.skipIf(URL_BASE === undefined)('15-O · la sonda de /ready mira el pool de la API', () => {
  exigirBase('sin DATABASE_URL_PRUEBAS', () => admin !== undefined);
  const nombre = `ncr-sonda-prueba-${CORRIDA}`;
  let pool: Pool | undefined;

  beforeAll(() => {
    pool = vigilarPool(
      new Pool({ connectionString: URL_BASE, max: 2, application_name: nombre }),
      () => undefined,
    );
  });
  afterAll(async () => {
    await pool?.end();
  });

  it('agotado: responde sin esperar en la cola que vigila; al soltar, ok', async () => {
    const p = pool as Pool;
    const sonda = new SondaDePostgresPg(p, 2);
    expect((await sonda.comprobar()).estado).toBe('ok');
    const prestados: PoolClient[] = [await p.connect(), await p.connect()];
    const enCola = p.connect();
    try {
      const inicio = Date.now();
      const r = await sonda.comprobar();
      expect(Date.now() - inicio).toBeLessThan(500);
      expect(r).toMatchObject({ estado: 'roto', clase: 'agotado' });
      expect(r.detalle).toMatch(/las 2 conexiones del pool están ocupadas y 1 petición/);
    } finally {
      for (const c of prestados) c.release();
      (await enCola).release();
    }
    expect((await sonda.comprobar()).estado).toBe('ok');
  });

  it('un corte de sus conexiones ociosas: sigue ok y lo publica como último corte', async () => {
    const p = pool as Pool;
    const sonda = new SondaDePostgresPg(p, 2);
    await sonda.comprobar();
    await (admin as Pool).query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1`,
      [nombre],
    );
    await new Promise((r) => setTimeout(r, 300));
    const r = await sonda.comprobar();
    expect(r.estado).toBe('ok');
    expect(r.ultimoCorte?.categoria).toBe('la base cortó la conexión');
  });

  it('la base inalcanzable: no-disponible, con la clase y sin el host', async () => {
    const lejos = new URL(URL_BASE as string);
    lejos.hostname = '127.0.0.1';
    lejos.port = '1';
    const inalcanzable = vigilarPool(
      new Pool({ connectionString: lejos.toString(), max: 1 }),
      () => undefined,
    );
    try {
      const r = await new SondaDePostgresPg(inalcanzable, 1, 1_000).comprobar();
      expect(r).toMatchObject({
        estado: 'roto',
        clase: 'no-disponible',
        detalle: 'no se pudo abrir una conexión con la base',
      });
    } finally {
      await inalcanzable.end();
    }
  });
});

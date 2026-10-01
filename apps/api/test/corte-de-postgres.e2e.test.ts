import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { COP_A, configuracionDePrueba, crearApp, crearFirmante, tokenDe } from './utilidades';
import { URL_BASE, exigirBase } from './base-exigida';
import {
  CABECERA_FIRMA,
  CABECERA_MARCA,
  firmar,
} from '../src/autorizaciones/presentacion/firma-ingesta';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-O · POSTGRESQL CORTA UNA CONEXIÓN Y LA API SIGUE VIVA
 *
 * En sitio (30/09/2026) el pooler de sesión de Supabase cortó conexiones y el
 * proceso murió: «Unhandled 'error' event · Connection terminated
 * unexpectedly». Ni el `Pool` ni los clientes prestados con `pool.connect()`
 * tenían oyente de `'error'`, y Node termina el proceso ante un `'error'` sin
 * oyente.
 *
 * Aquí se corta de verdad, con `pg_terminate_backend`, contra un PostgreSQL
 * real y con la API en marcha:
 *  · conexiones OCIOSAS del pool: el proceso sigue y la siguiente petición va;
 *  · una conexión a MITAD de una transacción (bloqueada en un INSERT): esa
 *    petición falla con 503 «base de datos no disponible» —no se reintenta: no
 *    es una lectura— y la siguiente va;
 *  · una LECTURA cortada a mitad: se reintenta una vez y responde 200.
 *
 * Sólo se cortan conexiones del pool de ESTA app (sus pid se leen antes): la
 * base es compartida con las demás suites.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const rango = () => ({
  desde: new Date(Date.now() - 3_600_000).toISOString(),
  hasta: new Date(Date.now() + 3_600_000).toISOString(),
});

describe('15-O · la API ante una conexión cortada por PostgreSQL', () => {
  let app: INestApplication | undefined;
  let admin: Pool | undefined;
  let token = '';
  exigirBase('sin DATABASE_URL_PRUEBAS', () => app !== undefined);
  const servidor = () => (app as INestApplication).getHttpServer();

  /** Los pid de las conexiones que el pool de la app tiene abiertas AHORA. */
  const pidsDelPool = async (cuantas = 4): Promise<number[]> => {
    const pool = (app as INestApplication).get(Pool);
    const clientes: PoolClient[] = [];
    try {
      for (let i = 0; i < cuantas; i += 1) clientes.push(await pool.connect());
      const pids = await Promise.all(
        clientes.map(
          async (c) =>
            (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid ?? 0,
        ),
      );
      return pids.filter((p) => p > 0);
    } finally {
      for (const c of clientes) c.release();
    }
  };

  const cortar = async (pids: readonly number[]): Promise<void> => {
    await (admin as Pool).query('SELECT pg_terminate_backend(pid) FROM unnest($1::int[]) AS pid', [
      [...pids],
    ]);
  };

  const listar = () =>
    request(servidor())
      .get(`/copropiedades/${COP_A}/eventos`)
      .query({ ...rango(), tamanoPagina: 5 })
      .set('Authorization', `Bearer ${token}`);

  const ingerir = () => {
    const cuerpo = {
      copropiedadId: COP_A,
      dispositivoId: randomUUID(),
      metodo: 'placa',
      placaLeida: 'CRT001',
      confianzaCentesimas: 95,
      referenciaExterna: `corte-${randomUUID()}`,
    };
    const marca = String(Math.floor(Date.now() / 1000));
    return request(servidor())
      .post('/ingesta/eventos')
      .set(CABECERA_MARCA, marca)
      .set(
        CABECERA_FIRMA,
        firmar(configuracionDePrueba.INGESTA_FIRMA_SECRETO, marca, JSON.stringify(cuerpo)),
      )
      .set('content-type', 'application/json')
      .send(cuerpo);
  };

  /** Espera a que una conexión de la app quede bloqueada por `bloqueador`. */
  const bloqueadaPor = async (
    bloqueador: number,
    candidatas: readonly number[],
  ): Promise<number> => {
    for (let i = 0; i < 100; i += 1) {
      const { rows } = await (admin as Pool).query<{ pid: number }>(
        `SELECT pid FROM pg_stat_activity
          WHERE $1 = ANY(pg_blocking_pids(pid)) AND pid = ANY($2::int[])`,
        [bloqueador, [...candidatas]],
      );
      const pid = rows[0]?.pid;
      if (pid !== undefined) return pid;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('ninguna conexión de la app llegó a bloquearse');
  };

  beforeAll(async () => {
    if (URL_BASE === undefined || URL_BASE === '') return;
    admin = new Pool({ connectionString: URL_BASE, max: 2 });
    // El pool de la PRUEBA también escucha: el corte no es suyo.
    admin.on('error', () => undefined);
    const firmante = await crearFirmante();
    app = await crearApp(firmante, undefined, {
      CARGADOR_DE_CONTEXTO: 'postgres',
      PERSISTENCIA_DE_EVENTOS: 'postgres',
      DATABASE_URL: URL_BASE,
      DATABASE_POOLER_URL: URL_BASE,
    });
    token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  });
  afterAll(async () => {
    await app?.close();
    await admin?.end();
  });

  it('15-P · 0.6 · el pool de la API pide TCP keepalive', () => {
    if (app === undefined) return;
    expect((app.get(Pool) as Pool & { options: { keepAlive?: boolean } }).options.keepAlive).toBe(
      true,
    );
  });

  it('conexiones OCIOSAS cortadas: el proceso sigue y la siguiente petición responde', async () => {
    if (app === undefined) return;
    await listar().expect(200);
    const pids = await pidsDelPool();
    expect(pids.length).toBeGreaterThan(0);
    await cortar(pids);
    // El aviso de cierre llega a los clientes ociosos por el socket.
    await new Promise((r) => setTimeout(r, 300));
    await listar().expect(200);
    await listar().expect(200);
  });

  it('a MITAD de una transacción: 503 «base de datos no disponible», y la siguiente va', async () => {
    if (app === undefined) return;
    await ingerir().expect(202);
    const pids = await pidsDelPool();
    const bloqueo = await (admin as Pool).connect();
    try {
      await bloqueo.query('BEGIN');
      // SHARE deja leer y bloquea los INSERT: la ingesta queda DENTRO de su
      // transacción (BEGIN ya hecho), esperando.
      await bloqueo.query('LOCK TABLE public.recepciones_evento IN SHARE MODE');
      const pidBloqueo = (await bloqueo.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
        .rows[0]?.pid as number;
      const enVuelo = ingerir();
      const respuesta = new Promise<request.Response>((ok, mal) => {
        void enVuelo.then(ok, mal);
      });
      const victima = await bloqueadaPor(pidBloqueo, pids);
      await cortar([victima]);
      const r = await respuesta;
      expect(r.status).toBe(503);
      expect(JSON.stringify(r.body)).toMatch(/base de datos no disponible/i);
      expect(r.headers['retry-after']).toBeDefined();
    } finally {
      await bloqueo.query('ROLLBACK').catch(() => undefined);
      bloqueo.release();
    }
    await ingerir().expect(202);
  });

  it('una LECTURA cortada a mitad se reintenta una vez y responde 200', async () => {
    if (app === undefined) return;
    await listar().expect(200);
    const pids = await pidsDelPool();
    const bloqueo = await (admin as Pool).connect();
    let soltado = false;
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('LOCK TABLE public.eventos IN ACCESS EXCLUSIVE MODE');
      const pidBloqueo = (await bloqueo.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
        .rows[0]?.pid as number;
      const respuesta = new Promise<request.Response>((ok, mal) => {
        void listar().then(ok, mal);
      });
      const victima = await bloqueadaPor(pidBloqueo, pids);
      await cortar([victima]);
      // Se suelta el bloqueo: el reintento encuentra la tabla libre.
      await bloqueo.query('ROLLBACK');
      soltado = true;
      const r = await respuesta;
      expect(r.status).toBe(200);
    } finally {
      if (!soltado) await bloqueo.query('ROLLBACK').catch(() => undefined);
      bloqueo.release();
    }
    await listar().expect(200);
  });
});

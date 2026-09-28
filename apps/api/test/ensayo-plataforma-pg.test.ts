import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import {
  equipoRegistrado,
  eventosDeLaPlataforma,
  migracionesPendientes,
  sondearSalud,
} from '../../../scripts/lib/ensayo-plataforma.mjs';
import { RepositorioEventosDeEquipoPg } from '../src/eventos/infraestructura/repositorio-eventos-de-equipo-pg';
import { ACTOR_INGESTA } from '../src/comun/actores-de-servicio';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 (15-L) · LO QUE `pnpm sitio:ensayo` LE PREGUNTA A LA PLATAFORMA
 *
 * El paso 4 del ensayo, con la API en marcha, no se suscribe al equipo: mira si
 * el evento QUEDÓ en la base. Aquí, contra PostgreSQL real y con la RLS forzada:
 * un evento en vivo de ESE host, llegado después del gesto, lo encuentra; uno
 * anterior, uno histórico o uno de otro host, no. Las comprobaciones del Mac
 * (salud de la API y migraciones pendientes) se prueban sin base.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const COP = '10000000-0000-4000-8000-000000000001';
const CORRIDA = randomBytes(4).toString('hex');
const HOST = `ensayo-${CORRIDA}.invalid`;
let pool: Pool | undefined;
let dispositivoId = '';

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    pool = new Pool({ connectionString: URL_BASE, max: 4 });
    const c = await pool.connect();
    try {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ rol: 'superadministrador', usuario_id: ACTOR_INGESTA }),
      ]);
      const r = await c.query<{ id: string }>(
        `INSERT INTO public.dispositivos
           (copropiedad_id, nombre, tipo, host, puerto, credencial_ref, creado_por, actualizado_por)
         VALUES ($1, $2, 'terminal_facial', $3, 80, 'vault:pendiente', $4, $4)
         RETURNING id`,
        [COP, `Terminal del ensayo ${CORRIDA}`, HOST, ACTOR_INGESTA],
      );
      dispositivoId = r.rows[0]?.id ?? '';
    } finally {
      c.release();
    }
  } catch {
    dispositivoId = '';
  }
});
afterAll(async () => {
  await pool?.end();
});

const omitida = (): boolean => dispositivoId === '';

const registrar = (titulo: string, enVivo: boolean) =>
  new RepositorioEventosDeEquipoPg(pool as Pool).registrar({
    copropiedadId: COP,
    dispositivoId,
    tipo: 'timbre',
    titulo,
    codigoMayor: 5,
    codigoMenor: 1,
    origen: 'equipo',
    enVivo,
    ocurridoEn: new Date(),
    horaDelEquipo: null,
    eventoId: null,
    claveIdempotencia: `ensayo-${CORRIDA}-${titulo}`,
    carga: {},
    creadoPor: ACTOR_INGESTA,
  });

describe('paso 4 · el evento del gesto, leído de la base (RLS forzada)', () => {
  // H-15L-C01 · con `--con-base`, una prueba sin base FALLA aquí, con su nombre.
  exigirBase('sin DATABASE_URL_PRUEBAS o sin semillas', () => dispositivoId !== '');

  it('lo anterior al gesto y lo histórico no cuentan; lo nuevo y en vivo, sí', async () => {
    if (omitida()) return;
    await registrar('anterior al gesto', true);
    await new Promise((listo) => setTimeout(listo, 50));
    const plataforma = eventosDeLaPlataforma(pool as Pool, { intervaloMs: 100 });
    const desde = new Date();

    const inicio = Date.now();
    expect(await plataforma.primeroDesde(HOST, desde, 300)).toBeNull();
    expect(Date.now() - inicio).toBeGreaterThanOrEqual(250);

    const espera = plataforma.primeroDesde(HOST, desde, 5000);
    await registrar('histórico del volcado', false);
    setTimeout(() => void registrar('Llamada al timbre', true), 300);
    const visto = await espera;
    expect(visto?.titulo).toBe('Llamada al timbre');
    expect(visto?.ocurridoEn.getTime()).toBeGreaterThanOrEqual(desde.getTime());

    // Otro host no ve lo de éste.
    expect(await plataforma.primeroDesde(`otro-${HOST}`, desde, 100)).toBeNull();
  });

  it('dice si el host está dado de alta en la consola, y en qué copropiedad', async () => {
    if (omitida()) return;
    const alta = await equipoRegistrado(pool as Pool, HOST);
    expect(alta).toHaveLength(1);
    expect(alta[0]?.nombre).toBe(`Terminal del ensayo ${CORRIDA}`);
    expect(await equipoRegistrado(pool as Pool, `nadie-${HOST}`)).toEqual([]);
  });

  it('la lectura es de SÓLO LECTURA aunque la conexión sea la del dueño', async () => {
    if (omitida()) return;
    // Un host con comillas no rompe nada: va parametrizado.
    await expect(
      eventosDeLaPlataforma(pool as Pool).primeroDesde("x'; DROP TABLE x; --", new Date(), 0),
    ).resolves.toBeNull();
  });
});

describe('comprobaciones del Mac, sin base', () => {
  it('migraciones pendientes: las del repositorio que la base no tiene; sin registro, null', async () => {
    const carpeta = mkdtempSync(join(tmpdir(), 'migraciones-'));
    try {
      writeFileSync(join(carpeta, '20260906120000_0001_a.sql'), '');
      writeFileSync(join(carpeta, '20260927130000_0041_b.sql'), '');
      writeFileSync(join(carpeta, 'LEEME.md'), '');
      const conUna = { query: async () => ({ rows: [{ version: '20260906120000' }] }) };
      expect(await migracionesPendientes(conUna as unknown as Pool, carpeta)).toEqual([
        '20260927130000_0041_b.sql',
      ]);
      const sinRegistro = {
        query: async () => {
          throw new Error('relation "supabase_migrations.schema_migrations" does not exist');
        },
      };
      expect(await migracionesPendientes(sinRegistro as unknown as Pool, carpeta)).toBeNull();
    } finally {
      rmSync(carpeta, { recursive: true, force: true });
    }
  });

  it('salud: contesta, contesta mal, o nadie escucha', async () => {
    const servidor = createServer((q, r) => {
      r.statusCode = q.url === '/health' ? 200 : 503;
      r.end('{}');
    });
    await new Promise<void>((listo) => servidor.listen(0, '127.0.0.1', listo));
    const { port } = servidor.address() as AddressInfo;
    try {
      expect(await sondearSalud(`http://127.0.0.1:${String(port)}/health`)).toEqual({
        alcanzada: true,
        ok: true,
        estado: 200,
      });
      expect((await sondearSalud(`http://127.0.0.1:${String(port)}/otra`)).ok).toBe(false);
    } finally {
      await new Promise((listo) => servidor.close(listo));
    }
    const cerrado = await sondearSalud(`http://127.0.0.1:${String(port)}/health`, 1000);
    expect(cerrado).toMatchObject({ alcanzada: false, motivo: 'conexión rechazada' });
  });
});

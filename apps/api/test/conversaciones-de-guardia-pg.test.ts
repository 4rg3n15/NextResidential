import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { ConversacionesPg } from '../src/guardia/infraestructura/conversaciones-pg';
import { ACTOR_INGESTA } from '../src/comun/actores-de-servicio';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * 15-P · P2 · LA CONSTANCIA DE LAS CONVERSACIONES CONTRA POSTGRESQL (0047)
 *
 * El repositorio escribe como el SERVICIO de la copropiedad —la única política
 * de inserción—, la fila queda con los tramos y los segundos hablados, el
 * mismo identificador no duplica, y la tabla es de solo inserción.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const OPERADOR = '00000000-0000-4000-8000-000000000011';
let pool: Pool | undefined;
let disponible = false;

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    pool = new Pool({ connectionString: URL_BASE, max: 2 });
    const r = await pool.query<{ existe: boolean }>(
      "SELECT to_regclass('public.conversaciones_de_guardia') IS NOT NULL AS existe",
    );
    disponible = r.rows[0]?.existe === true;
  } catch {
    disponible = false;
  }
});
afterAll(async () => {
  await pool?.end();
});

const leer = async (id: string) => {
  const c = await (pool as Pool).connect();
  try {
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ rol: 'superadministrador', usuario_id: ACTOR_INGESTA }),
    ]);
    const r = await c.query<{
      tramos: unknown;
      segundos_hablados: string;
      motivo_de_cierre: string;
    }>(
      'SELECT tramos, segundos_hablados, motivo_de_cierre FROM public.conversaciones_de_guardia WHERE id = $1',
      [id],
    );
    return r.rows;
  } finally {
    c.release();
  }
};

describe('ConversacionesPg · contra PostgreSQL con RLS forzada', () => {
  exigirBase('sin DATABASE_URL_PRUEBAS o sin la migración 0047', () => disponible);

  it('registra como el servicio, con tramos y segundos; el mismo id no duplica', async () => {
    if (!disponible) return;
    const id = randomUUID();
    const inicio = new Date('2026-10-01T12:00:00Z');
    const conversacion = {
      id,
      copropiedadId: COP,
      dispositivoId: randomUUID(),
      operadorId: OPERADOR,
      iniciadaEn: inicio,
      terminadaEn: new Date(inicio.getTime() + 60_000),
      tramos: [
        { desde: new Date(inicio.getTime() + 5_000), hasta: new Date(inicio.getTime() + 9_500) },
        { desde: new Date(inicio.getTime() + 20_000), hasta: new Date(inicio.getTime() + 22_000) },
      ],
      motivoDeCierre: 'El operador colgó',
    };
    const repositorio = new ConversacionesPg(pool as Pool);
    await repositorio.registrar(conversacion);
    await repositorio.registrar(conversacion);
    const filas = await leer(id);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.motivo_de_cierre).toBe('El operador colgó');
    expect(Number(filas[0]?.segundos_hablados)).toBe(6.5);
    expect(filas[0]?.tramos).toEqual([
      { desde: '2026-10-01T12:00:05.000Z', hasta: '2026-10-01T12:00:09.500Z' },
      { desde: '2026-10-01T12:00:20.000Z', hasta: '2026-10-01T12:00:22.000Z' },
    ]);
  });

  it('es de solo inserción: ni el dueño la cambia', async () => {
    if (!disponible) return;
    await expect(
      (pool as Pool).query("UPDATE public.conversaciones_de_guardia SET motivo_de_cierre = 'otro'"),
    ).rejects.toThrow();
  });
});

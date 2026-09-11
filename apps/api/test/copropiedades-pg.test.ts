import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { RepositorioCopropiedadesPg } from '../src/multiempresa/repositorio-copropiedades-pg';
import type { ContextoTenant } from '../src/autenticacion';

/**
 * El catálogo de copropiedades **por el camino de la RLS**, contra PostgreSQL
 * real — §2.7.6 exige comprobar el aislamiento por los dos.
 *
 * La suite de aislamiento prueba el filtro de la capa de aplicación con un
 * doble en memoria. Eso deja sin ejercer la mitad que de verdad importa aquí:
 * que `app.es_superadmin()` conceda el alcance global a una identidad **cuyo
 * `copropiedad_id` es nulo**. Es la afirmación en la que se apoyó el diseño del
 * gancho de claims y que nadie había ejecutado: el superadministrador quedó
 * inutilizado durante una semana precisamente por leer ese nulo como «sin
 * permiso».
 *
 * Se OMITE —no falla— sin `DATABASE_URL_PRUEBAS`. Cuando se omite, lo dice.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP_MIRA = '10000000-0000-4000-8000-000000000001';
const COP_ROBLE = '10000000-0000-4000-8000-000000000002';
const USUARIO = '00000000-0000-4000-8000-000000000010';

let pool: Pool | undefined;
let disponible = false;

const ctx = (
  rol: ContextoTenant['rol'],
  copropiedadId: string | null,
  atendidas: string[] = [],
): ContextoTenant => ({
  usuarioId: USUARIO,
  rol,
  copropiedadId,
  copropiedadesAtendidas: atendidas,
  mfaVerificado: true,
});

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    pool = new Pool({ connectionString: URL_BASE, max: 4 });
    const { rows } = await pool.query('SELECT count(*)::int n FROM public.copropiedades');
    disponible = (rows[0]?.n ?? 0) >= 2;
  } catch {
    disponible = false;
  }
});
afterAll(async () => {
  await pool?.end();
});

const omitida = (): boolean => {
  if (disponible) return false;
  console.warn('OMITIDA: sin DATABASE_URL_PRUEBAS o sin las dos copropiedades de las semillas.');
  return true;
};

describe('RLS · el alcance del superadministrador es global sin pertenecer a ninguna', () => {
  it('ve LAS DOS copropiedades de las semillas con copropiedad_id nulo', async () => {
    if (omitida()) return;
    const repo = new RepositorioCopropiedadesPg(pool as Pool);
    const filas = await repo.listarParaElAlcance(ctx('superadministrador', null));
    expect(filas.map((c) => c.id).sort()).toEqual([COP_MIRA, COP_ROBLE].sort());
    // El nombre hace falta para el selector de la cabecera: sin él, el
    // superadministrador elegiría entre dos UUID.
    expect(filas.every((c) => c.nombre.length > 0)).toBe(true);
    expect(filas.every((c) => c.zonaHoraria.length > 0)).toBe(true);
  });

  it('un administrador de Mira ve UNA, y la política RLS es quien lo decide', async () => {
    if (omitida()) return;
    const repo = new RepositorioCopropiedadesPg(pool as Pool);
    const filas = await repo.listarParaElAlcance(ctx('administrador', COP_MIRA));
    expect(filas.map((c) => c.id)).toEqual([COP_MIRA]);
  });

  it('la RLS filtra por sí sola, sin el filtro de la aplicación', async () => {
    if (omitida()) return;
    /**
     * Consulta directa con los claims de un administrador de Mira, **sin pasar
     * por `filtrarPorAlcance`**. Si esta prueba viera las dos filas, el
     * aislamiento estaría dependiendo solo del código de la aplicación y la
     * ruta de la llave secreta —que omite la RLS— quedaría sin barrera de base.
     */
    const cliente = await (pool as Pool).connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ rol: 'administrador', usuario_id: USUARIO, copropiedad_id: COP_MIRA }),
      ]);
      await cliente.query('SET ROLE authenticated');
      const { rows } = await cliente.query<{ id: string }>(
        'SELECT id FROM public.copropiedades ORDER BY nombre',
      );
      expect(rows.map((r) => r.id)).toEqual([COP_MIRA]);
    } finally {
      await cliente.query('RESET ROLE').catch(() => undefined);
      cliente.release();
    }
  });

  it('y con los claims del superadministrador, la misma consulta ve las dos', async () => {
    if (omitida()) return;
    const cliente = await (pool as Pool).connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ rol: 'superadministrador', usuario_id: USUARIO, copropiedad_id: null }),
      ]);
      await cliente.query('SET ROLE authenticated');
      const { rows } = await cliente.query<{ id: string }>('SELECT id FROM public.copropiedades');
      expect(rows).toHaveLength(2);
    } finally {
      await cliente.query('RESET ROLE').catch(() => undefined);
      cliente.release();
    }
  });
});

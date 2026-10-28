import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomInt } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Pool } from 'pg';
import { claimsDeServicio } from '../src/comun/claims-de-servicio';
import { rutaDelRespaldo } from '../src/eventos/aplicacion/respaldo/dias';
import {
  DestinatariosDelRespaldoPg,
  EnviosDeRespaldoPg,
  RepositorioDeRespaldosPg,
} from '../src/eventos/infraestructura/respaldo-pg';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * D-147 · EL RESPALDO DIARIO CONTRA UNA BASE REAL (0061)
 *
 *  · el adaptador escribe y lee con los claims de SERVICIO de la copropiedad;
 *  · un día se registra una vez: la segunda devuelve el mismo (ON CONFLICT);
 *  · ninguna copropiedad ve ni anota los respaldos de otra;
 *  · `respaldos_de_eventos` y `envios_de_respaldo` no admiten UPDATE ni DELETE;
 *  · los destinatarios son superadministradores activos con correo entregable;
 *  · ningún fichero del respaldo escribe en `eventos` (RN-03).
 *
 * Todo pasa por un pool en `authenticated` (sin BYPASSRLS): la RLS forzada y el
 * REVOKE se ejercen de verdad, no los salta el superusuario de la base local.
 *
 * Las filas son append-only y se quedan en la base local: cada corrida usa un
 * día al azar de otro siglo para no chocar con la anterior.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const COP_AJENA = '10000000-0000-4000-8000-000000000002';
const SUPER = '00000000-0000-4000-8000-000000000002';
const ACTOR = '00000000-0000-4000-8000-000000000001';
const FECHA = new Date(Date.UTC(2101, 0, 1) + randomInt(0, 30_000) * 86_400_000)
  .toISOString()
  .slice(0, 10);

let pool: Pool | undefined;
let disponible = false;

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    // Sin `BYPASSRLS`: la conexión de pruebas es superusuario y se saltaría la RLS
    // forzada; cada cliente pasa a `authenticated`, como en claims-de-servicio-pg.
    pool = new Pool({ connectionString: URL_BASE, max: 4 });
    pool.on('connect', (c) => void c.query('SET ROLE authenticated'));
    const { rows } = await pool.query<{ existe: boolean }>(
      "SELECT to_regclass('public.respaldos_de_eventos') IS NOT NULL AS existe",
    );
    disponible = rows[0]?.existe === true;
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  await pool?.end();
});

exigirBase('sin DATABASE_URL_PRUEBAS o sin la migración 0061', () => disponible);
const omitida = (): boolean => !disponible;

const nuevo = (copropiedadId = COP) => ({
  copropiedadId,
  fecha: FECHA,
  ruta: rutaDelRespaldo(copropiedadId, FECHA),
  numeroDeEventos: 3,
  permitidos: 2,
  negados: 1,
  sha256: 'b'.repeat(64),
  tamanoBytes: 1234,
});

/** Una sentencia con los claims de servicio de una copropiedad; devuelve el SQLSTATE o null. */
const comoServicio = async (copropiedadId: string, sql: string): Promise<string | null> => {
  const c = await (pool as Pool).connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claimsDeServicio(copropiedadId)),
    ]);
    await c.query(sql);
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'desconocido';
  } finally {
    await c.query('ROLLBACK').catch(() => undefined);
    c.release();
  }
};

describe('D-147 · el repositorio del respaldo en PostgreSQL', () => {
  it('registra el día una vez: la segunda devuelve el mismo, con su ruta y huella', async () => {
    if (omitida()) return;
    const repo = new RepositorioDeRespaldosPg(pool as Pool);
    const primero = await repo.registrar(nuevo(), ACTOR);
    const segundo = await repo.registrar({ ...nuevo(), sha256: 'c'.repeat(64) }, ACTOR);
    expect(segundo.id).toBe(primero.id);
    expect(segundo.sha256).toBe('b'.repeat(64));
    expect(primero.ruta).toBe(
      `${COP}/${FECHA.slice(0, 4)}/${FECHA.slice(5, 7)}/eventos-${FECHA}.xls`,
    );
    expect((await repo.porFecha(COP, FECHA))?.id).toBe(primero.id);
    expect((await repo.desde(COP, FECHA)).map((r) => r.fecha)).toContain(FECHA);
  });

  it('anota intentos y los devuelve del más reciente al más antiguo', async () => {
    if (omitida()) return;
    const repo = new RepositorioDeRespaldosPg(pool as Pool);
    const envios = new EnviosDeRespaldoPg(pool as Pool);
    const r = await repo.registrar(nuevo(), ACTOR);
    await envios.anotar(
      COP,
      [
        {
          respaldoId: r.id,
          destinatarioId: SUPER,
          resultado: 'error',
          error: 'rechazado',
          enviadoEn: null,
          conEnlace: false,
        },
      ],
      ACTOR,
    );
    await envios.anotar(
      COP,
      [
        {
          respaldoId: r.id,
          destinatarioId: SUPER,
          resultado: 'enviado',
          error: null,
          enviadoEn: new Date(),
          conEnlace: false,
        },
      ],
      ACTOR,
    );
    const intentos = await envios.intentos(COP, [r.id]);
    expect(intentos.slice(0, 2).map((i) => i.resultado)).toEqual(['enviado', 'error']);
  });

  it('aislamiento: otra copropiedad no ve el respaldo ni sus intentos, ni puede anotarle', async () => {
    if (omitida()) return;
    const repo = new RepositorioDeRespaldosPg(pool as Pool);
    const envios = new EnviosDeRespaldoPg(pool as Pool);
    const r = await repo.registrar(nuevo(), ACTOR);
    expect(await repo.porFecha(COP_AJENA, FECHA)).toBeNull();
    expect(await envios.intentos(COP_AJENA, [r.id])).toEqual([]);
    expect((await repo.ultimos(COP_AJENA, 1000)).map((x) => x.id)).not.toContain(r.id);
    await expect(
      envios.anotar(
        COP_AJENA,
        [
          {
            respaldoId: r.id,
            destinatarioId: SUPER,
            resultado: 'sin_configurar',
            error: null,
            enviadoEn: null,
            conEnlace: false,
          },
        ],
        ACTOR,
      ),
    ).rejects.toMatchObject({ code: '23503' });
    // Y el servicio de la ajena no puede escribir un respaldo con la copropiedad de otra.
    await expect(
      new RepositorioDeRespaldosPg(pool as Pool).registrar(nuevo(COP_AJENA), ACTOR),
    ).resolves.toBeDefined();
    expect(
      await comoServicio(
        COP_AJENA,
        `INSERT INTO public.respaldos_de_eventos (copropiedad_id, fecha, ruta, numero_de_eventos,
           permitidos, negados, sha256, tamano_bytes, creado_por)
         VALUES ('${COP}', '2100-01-01', '${rutaDelRespaldo(COP, '2100-01-01')}', 0, 0, 0,
           '${'d'.repeat(64)}', 1, '${ACTOR}')`,
      ),
    ).toBe('42501');
  });

  it('append-only: ni UPDATE ni DELETE en las dos tablas', async () => {
    if (omitida()) return;
    for (const tabla of ['respaldos_de_eventos', 'envios_de_respaldo']) {
      expect(await comoServicio(COP, `UPDATE public.${tabla} SET creado_en = now()`)).toBe('42501');
      expect(await comoServicio(COP, `DELETE FROM public.${tabla}`)).toBe('42501');
    }
  });
});

describe('D-147 · los destinatarios', () => {
  it('el servicio de cualquier copropiedad lee a los superadministradores (0060)', async () => {
    if (omitida()) return;
    const c = await (pool as Pool).connect();
    try {
      await c.query('BEGIN READ ONLY');
      await c.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claimsDeServicio(COP)),
      ]);
      const { rows } = await c.query<{ id: string }>(
        `SELECT DISTINCT u.id FROM public.usuarios u
           JOIN public.roles_usuario r ON r.usuario_id = u.id
          WHERE r.rol = 'superadministrador' AND r.estado = 'activo' AND u.estado = 'activo'`,
      );
      expect(rows.map((r) => r.id)).toContain(SUPER);
    } finally {
      await c.query('ROLLBACK');
      c.release();
    }
  });

  it('sólo con correo entregable: los `.invalid` de las semillas y el actor de sistema no reciben', async () => {
    if (omitida()) return;
    const quienes = await new DestinatariosDelRespaldoPg(pool as Pool).superadministradores(COP);
    expect(quienes.every((d) => !d.correo.endsWith('.invalid'))).toBe(true);
    expect(quienes.map((d) => d.id)).not.toContain(ACTOR);
    expect(
      (await new DestinatariosDelRespaldoPg(pool as Pool).nombreDeCopropiedad(COP)).length,
    ).toBeGreaterThan(0);
  });
});

describe('D-147 · el respaldo sólo LEE eventos (RN-03)', () => {
  it('ningún fichero del respaldo tiene una sentencia UPDATE, DELETE o TRUNCATE', () => {
    const raiz = resolve(__dirname, '../src/eventos');
    const ficheros = [
      ...readdirSync(join(raiz, 'aplicacion/respaldo')).map((f) =>
        join(raiz, 'aplicacion/respaldo', f),
      ),
      join(raiz, 'infraestructura/respaldo-pg.ts'),
      join(raiz, 'infraestructura/almacen-de-respaldos-supabase.ts'),
      join(raiz, 'infraestructura/resolutor-de-nombres-pg.ts'),
    ].filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    for (const f of ficheros) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(
        /\bUPDATE\s+(public\.)?\w+\s+SET\b|\bDELETE\s+FROM\b|\bTRUNCATE\s+(TABLE\s+)?(public\.)?\w+/i,
      );
    }
  });
});

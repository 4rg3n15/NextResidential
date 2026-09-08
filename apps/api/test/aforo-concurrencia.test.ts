import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { RepositorioZonasPg } from '../src/zonas/infraestructura/repositorio-zonas-pg';

/**
 * RN-14 · CA-14 — **el aforo lo garantiza la base, no el código.**
 *
 * Esta es la prueba que da sentido a la etapa. Cincuenta ingresos SIMULTÁNEOS
 * sobre una zona con diez plazas: exactamente diez entran y cuarenta reciben
 * `aforo_superado`, con el contador en diez y no en once.
 *
 * Un repositorio en memoria no puede demostrar esto: JavaScript tiene un solo
 * hilo, así que dos peticiones nunca coinciden y cualquier implementación pasa.
 * Lo que se prueba aquí es que el `UPDATE … WHERE conteo_actual < aforo_maximo`
 * no deja ventana entre comprobar y ocupar, y que el
 * `CHECK (conteo_actual <= aforo_maximo)` de la migración 0007 sostiene la
 * invariante aunque alguien escriba por otra vía.
 *
 * Cincuenta conexiones de verdad, no cincuenta promesas sobre una: con un solo
 * cliente PostgreSQL las serializaría y la prueba pasaría sin haber probado nada
 * — la misma lección que dejó KPI-03 con las placas.
 *
 * Se OMITE —no falla— sin `DATABASE_URL_PRUEBAS`. Cuando se omite, lo dice.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';
/** Zona «Salón social» de las semillas: aforo 100, contador a cero. */
const ZONA = '80000000-0000-4000-8000-000000000003';

const AFORO = 10;
const INTENTOS = 50;

let pool: Pool | undefined;
let disponible = false;

const claims = {
  rol: 'administrador',
  usuario_id: '00000000-0000-4000-8000-000000000010',
  copropiedad_id: COP,
};

const conContexto = async <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => {
  const cliente = await (pool as Pool).connect();
  try {
    await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claims),
    ]);
    return await fn(cliente);
  } finally {
    cliente.release();
  }
};

const ponerAforo = async (maximo: number, actual: number): Promise<void> => {
  await conContexto((c) =>
    c.query(
      `UPDATE public.zona_aforo SET aforo_maximo=$3, conteo_actual=$4
        WHERE copropiedad_id=$1 AND zona_id=$2`,
      [COP, ZONA, maximo, actual],
    ),
  );
};

const conteo = async (): Promise<number> => {
  const { rows } = await conContexto((c) =>
    c.query<{ conteo_actual: number }>(
      'SELECT conteo_actual FROM public.zona_aforo WHERE copropiedad_id=$1 AND zona_id=$2',
      [COP, ZONA],
    ),
  );
  return rows[0]?.conteo_actual ?? -1;
};

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    // Una conexión por intento: es lo que hace real la simultaneidad.
    pool = new Pool({ connectionString: URL_BASE, max: INTENTOS + 10 });
    const { rows } = await conContexto((c) =>
      c.query('SELECT 1 FROM public.zona_aforo WHERE copropiedad_id=$1 AND zona_id=$2', [
        COP,
        ZONA,
      ]),
    );
    disponible = rows.length === 1;
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  await pool?.end();
});

const omitida = (): boolean => {
  if (disponible) return false;
  console.warn('OMITIDA: sin DATABASE_URL_PRUEBAS o sin semillas. Se ejecuta en CI (ETAPA 14).');
  return true;
};

describe('RN-14 · el aforo bajo concurrencia real', () => {
  it(`${INTENTOS} ingresos simultáneos sobre ${AFORO} plazas: entran ${AFORO}, ni una más`, async () => {
    if (omitida()) return;
    await ponerAforo(AFORO, 0);

    const repositorio = new RepositorioZonasPg(pool as Pool, claims);
    const resultados = await Promise.all(
      Array.from({ length: INTENTOS }, () => repositorio.ocupar(COP, ZONA)),
    );

    const admitidos = resultados.filter((r) => r.tipo === 'ocupado').length;
    const rechazados = resultados.filter((r) => r.tipo === 'aforo_superado').length;

    expect(admitidos).toBe(AFORO);
    expect(rechazados).toBe(INTENTOS - AFORO);
    expect(await conteo()).toBe(AFORO);
  }, 60_000);

  it('los conteos devueltos a los admitidos son 1..N sin repetirse', async () => {
    if (omitida()) return;
    await ponerAforo(AFORO, 0);

    const repositorio = new RepositorioZonasPg(pool as Pool, claims);
    const resultados = await Promise.all(
      Array.from({ length: INTENTOS }, () => repositorio.ocupar(COP, ZONA)),
    );

    // Dos ingresos con el mismo número serían dos personas ocupando la misma
    // plaza: es el síntoma exacto de una lectura seguida de una escritura.
    const conteos = resultados
      .filter((r): r is { tipo: 'ocupado'; conteo: number } => r.tipo === 'ocupado')
      .map((r) => r.conteo)
      .sort((a, b) => a - b);
    expect(conteos).toEqual(Array.from({ length: AFORO }, (_, i) => i + 1));
  }, 60_000);

  it('el CHECK de la base rechaza la violación aunque se intente por SQL directo', async () => {
    if (omitida()) return;
    await ponerAforo(AFORO, AFORO);

    let fallo: unknown = null;
    try {
      await conContexto((c) =>
        c.query(
          `UPDATE public.zona_aforo SET conteo_actual = aforo_maximo + 1
            WHERE copropiedad_id=$1 AND zona_id=$2`,
          [COP, ZONA],
        ),
      );
    } catch (e) {
      fallo = e;
    }

    // El código no es la garantía: es quien la usa bien. Aunque alguien escriba
    // saltándose el adaptador, la fila no puede quedar en un estado inválido.
    expect(fallo, 'el CHECK zona_aforo_no_supera_maximo NO rechazó la violación').not.toBeNull();
    expect(String(fallo)).toMatch(/zona_aforo_no_supera_maximo|check constraint/i);
    expect(await conteo()).toBe(AFORO);
  });

  it('el contador tampoco puede quedar negativo', async () => {
    if (omitida()) return;
    await ponerAforo(AFORO, 0);

    let fallo: unknown = null;
    try {
      await conContexto((c) =>
        c.query(
          'UPDATE public.zona_aforo SET conteo_actual = -1 WHERE copropiedad_id=$1 AND zona_id=$2',
          [COP, ZONA],
        ),
      );
    } catch (e) {
      fallo = e;
    }
    expect(fallo).not.toBeNull();
  });

  it('liberar en paralelo desde cero no baja de cero', async () => {
    if (omitida()) return;
    await ponerAforo(AFORO, 3);

    const repositorio = new RepositorioZonasPg(pool as Pool, claims);
    await Promise.all(Array.from({ length: 20 }, () => repositorio.liberar(COP, ZONA)));

    // El suelo va en el WHERE del UPDATE, así que veinte salidas sobre tres
    // entradas dejan el contador en cero y no en −17.
    expect(await conteo()).toBe(0);
  }, 60_000);
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes, randomInt } from 'node:crypto';
import { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { ActividadPorViviendaPg } from '../src/tablero/infraestructura/actividad-por-vivienda-pg';
import { URL_BASE, exigirBase } from './base-exigida';
import { COP_A, COP_B } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Z3 (D-Z3) · LA ACTIVIDAD POR VIVIENDA CONTRA LA BASE REAL
 *
 * Los límites que la ronda exige: una vigencia que vence ESTE minuto, juzgada
 * con un instante inyectado a un lado y al otro del límite; una salida
 * registrada; otra copropiedad; una vivienda sin actividad (sale con ceros, no
 * desaparece); y 500 viviendas en UNA consulta —se cuentan las sentencias que
 * pasan por el cliente, no se confía en el comentario del adaptador—.
 *
 * Se OMITE —no falla— sin `DATABASE_URL_PRUEBAS`; con `--con-base` se exige.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CORRIDA = randomBytes(4).toString('hex');
const SUPER = '00000000-0000-4000-8000-000000000001';
const VISITANTE = '60000000-0000-4000-8000-000000000101';
const OTRO_VISITANTE = '60000000-0000-4000-8000-000000000102';
const EQUIPO = '90000000-0000-4000-8000-000000000001';

let pool: Pool | undefined;
let disponible = false;
/** Un instante fijo cerca de ahora: las particiones de `eventos` son mensuales. */
const AHORA = new Date(Date.now() - 5 * 60_000);
const minutos = (n: number): Date => new Date(AHORA.getTime() + n * 60_000);

beforeAll(async () => {
  if (!URL_BASE) return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    await pool.query('SELECT 1 FROM public.viviendas LIMIT 1');
    disponible = true;
  } catch {
    disponible = false;
  }
});
afterAll(async () => {
  await pool?.end();
});
exigirBase('sin DATABASE_URL_PRUEBAS', () => disponible);

const base = (): Pool => {
  if (pool === undefined) throw new Error('sin base');
  return pool;
};
/** Quien autoriza debe ser titular de ESA vivienda (RN-05, disparador 0013). */
const titulares = new Map<string, string>();
const vivienda = async (cop: string, identificador: string, agrupacion: string | null) => {
  const id = (
    await base().query<{ id: string }>(
      `INSERT INTO public.viviendas (copropiedad_id, identificador, agrupacion, creado_por, actualizado_por)
       VALUES ($1, $2, $3, $4, $4) RETURNING id`,
      [cop, `${identificador}-${CORRIDA}`, agrupacion, SUPER],
    )
  ).rows[0]?.id as string;
  const documento = `9${CORRIDA}${String(titulares.size).padStart(2, '0')}`
    .replace(/\D/g, '')
    .slice(0, 12);
  const persona = (
    await base().query<{ id: string }>(
      `INSERT INTO public.personas (copropiedad_id, tipo_documento, numero_documento, nombre_completo,
                                    creado_por, actualizado_por)
       VALUES ($1, 'cedula', $2, 'Titular de prueba 15-Z3', $3, $3) RETURNING id`,
      [cop, documento, SUPER],
    )
  ).rows[0]?.id as string;
  const titular = (
    await base().query<{ id: string }>(
      `INSERT INTO public.residentes (copropiedad_id, vivienda_id, persona_id, parentesco, es_titular,
                                      creado_por, actualizado_por)
       VALUES ($1, $2, $3, 'Propietario', true, $4, $4) RETURNING id`,
      [cop, id, persona, SUPER],
    )
  ).rows[0]?.id as string;
  titulares.set(id, titular);
  return id;
};
const autorizacion = async (
  viviendaId: string,
  vigencia: readonly [Date, Date],
  placa: string | null,
  visitante = VISITANTE,
) =>
  (
    await base().query<{ id: string }>(
      `INSERT INTO public.autorizaciones
         (copropiedad_id, vivienda_id, visitante_id, autorizado_por, tipo, placa, vigencia,
          permite_acceso_vehicular, creado_por, actualizado_por)
       VALUES ($1, $2, $3, $4, 'unica', $5, tstzrange($6, $7, '[)'), $8, $9, $9) RETURNING id`,
      [
        COP_A,
        viviendaId,
        visitante,
        titulares.get(viviendaId),
        placa,
        vigencia[0],
        vigencia[1],
        placa !== null,
        SUPER,
      ],
    )
  ).rows[0]?.id as string;
const evento = async (
  viviendaId: string,
  autorizacionId: string,
  tipo: 'ingreso' | 'salida',
  en: Date,
  placa: string | null = null,
) =>
  base().query(
    `INSERT INTO public.eventos (copropiedad_id, ocurrido_en, tipo, resultado, metodo, vivienda_id,
                                 autorizacion_id, dispositivo_id, regla_aplicada, version_reglas,
                                 clave_idempotencia, creado_por, placa_detectada)
     VALUES ($1, $2, $3, 'permitido', $4, $5, $6, $7, 'prueba-15z3', 1, $8, $9, $10)`,
    [
      COP_A,
      en,
      tipo,
      placa === null ? 'manual' : 'placa',
      viviendaId,
      autorizacionId,
      EQUIPO,
      `z3-${CORRIDA}-${randomBytes(4).toString('hex')}`,
      SUPER,
      placa,
    ],
  );

const filaDe = async (cop: string, viviendaId: string, en: Date) =>
  (await new ActividadPorViviendaPg(base()).consultar(cop, en))?.find(
    (f) => f.viviendaId === viviendaId,
  );

// Como el resto de las pruebas contra base: sin `DATABASE_URL_PRUEBAS` se OMITEN (CI sin base); `--con-base` las exige por `exigirBase`.
describe.skipIf(!URL_BASE)('15-Z3 · actividad por vivienda contra PostgreSQL', () => {
  it('una vigencia que vence este minuto: cuenta un segundo antes y no cuenta en el límite', async () => {
    const v = await vivienda(COP_A, 'Z3-A', 'Torre 1');
    const vence = minutos(1);
    const a = await autorizacion(v, [minutos(-60), vence], 'ZZZ123');
    await evento(v, a, 'ingreso', minutos(-30), 'ZZZ123');
    const antes = await filaDe(COP_A, v, new Date(vence.getTime() - 1000));
    expect(antes).toMatchObject({
      visitantesAhora: 1,
      vehiculosEnVisita: 1,
      agrupacion: 'Torre 1',
    });
    // '[)': en el instante exacto del vencimiento la visita ya no es vigente.
    expect(await filaDe(COP_A, v, vence)).toMatchObject({
      visitantesAhora: 0,
      vehiculosEnVisita: 0,
    });
    // Antes del ingreso tampoco: el instante juzgado es el inyectado, no `now()`.
    expect(await filaDe(COP_A, v, minutos(-45))).toMatchObject({ visitantesAhora: 0 });
  });

  it('una salida registrada después del ingreso deja de contar; un segundo ingreso vuelve a contar', async () => {
    const v = await vivienda(COP_A, 'Z3-B', 'Torre 1');
    const a = await autorizacion(v, [minutos(-60), minutos(60)], null);
    await evento(v, a, 'ingreso', minutos(-30));
    await evento(v, a, 'salida', minutos(-20));
    expect(await filaDe(COP_A, v, minutos(-25))).toMatchObject({
      visitantesAhora: 1,
      vehiculosEnVisita: 0,
    });
    expect(await filaDe(COP_A, v, AHORA)).toMatchObject({ visitantesAhora: 0 });
    await evento(v, a, 'ingreso', minutos(-10));
    expect(await filaDe(COP_A, v, AHORA)).toMatchObject({
      visitantesAhora: 1,
      vehiculosEnVisita: 0,
    });
  });

  it('dos visitantes en la misma vivienda, uno con placa en la visita: 2 visitantes, 1 vehículo', async () => {
    const v = await vivienda(COP_A, 'Z3-C', 'Torre 2');
    const conPlaca = await autorizacion(v, [minutos(-60), minutos(60)], 'ZZZ456');
    const sinPlaca = await autorizacion(v, [minutos(-60), minutos(60)], null, OTRO_VISITANTE);
    await evento(v, conPlaca, 'ingreso', minutos(-30));
    await evento(v, sinPlaca, 'ingreso', minutos(-29));
    expect(await filaDe(COP_A, v, AHORA)).toMatchObject({
      visitantesAhora: 2,
      vehiculosEnVisita: 1,
    });
  });

  it('una vivienda sin actividad sale con ceros, no desaparece; y la de otra copropiedad no sale', async () => {
    const quieta = await vivienda(COP_A, 'Z3-D', null);
    const ajena = await vivienda(COP_B, 'Z3-E', 'Torre 9');
    const deA = await new ActividadPorViviendaPg(base()).consultar(COP_A, AHORA);
    expect(deA?.find((f) => f.viviendaId === quieta)).toEqual({
      viviendaId: quieta,
      identificador: `Z3-D-${CORRIDA}`,
      agrupacion: null,
      vehiculosEnVisita: 0,
      visitantesAhora: 0,
    });
    expect(deA?.some((f) => f.viviendaId === ajena)).toBe(false);
    const deB = await new ActividadPorViviendaPg(base()).consultar(COP_B, AHORA);
    expect(deB?.some((f) => f.viviendaId === ajena)).toBe(true);
    expect(deB?.some((f) => f.viviendaId === quieta)).toBe(false);
  });

  it('una copropiedad que no existe es null, no una lista vacía', async () => {
    const r = await new ActividadPorViviendaPg(base()).consultar(
      '10000000-0000-4000-8000-0000000000ff',
      AHORA,
    );
    expect(r).toBeNull();
  });

  it('500 viviendas salen en UNA consulta: cuatro sentencias por el cliente (BEGIN, claims, SELECT, COMMIT)', async () => {
    const cop = (
      await base().query<{ id: string }>(
        `INSERT INTO public.copropiedades (nombre, nit, codigo_corto, creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $4) RETURNING id`,
        [
          `Z3 ${CORRIDA}`,
          `7${String(randomInt(100_000_000_000)).padStart(11, '0')}`,
          `Z${String(randomInt(1_000_000)).padStart(6, '0')}`,
          SUPER,
        ],
      )
    ).rows[0]?.id as string;
    await base().query(
      `INSERT INTO public.viviendas (copropiedad_id, identificador, agrupacion, creado_por, actualizado_por)
       SELECT $1, 'V' || n, 'Torre ' || ((n % 5) + 1), $2, $2 FROM generate_series(1, 500) AS n`,
      [cop, SUPER],
    );
    const sentencias: string[] = [];
    const contado = Object.create(base()) as Pool;
    contado.connect = (async () => {
      const cliente = await base().connect();
      const original = cliente.query.bind(cliente) as PoolClient['query'];
      const espia = ((texto: unknown, ...resto: unknown[]) => {
        sentencias.push(typeof texto === 'string' ? (texto.trim().split(/\s+/)[0] ?? '') : '?');
        return (original as (...a: unknown[]) => unknown)(texto, ...resto);
      }) as PoolClient['query'];
      cliente.query = espia;
      return cliente;
    }) as Pool['connect'];
    const filas = await new ActividadPorViviendaPg(contado).consultar(cop, AHORA);
    expect(filas).toHaveLength(500);
    expect(sentencias).toEqual(['BEGIN', 'SELECT', 'WITH', 'COMMIT']);
  });
});

import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { RutasDeEquiposPg, TODO_DIRECTO } from './rutas-de-equipos';

/**
 * 15-Q2 · R1 · por dónde se llega a cada equipo. Sin base, TODO directo; con
 * base, la respuesta se recuerda 5 s y un id que no es UUID ni se consulta.
 * La base es de mentira (un `Pool` con `connect`): aquí se prueba la memoria,
 * no el SQL, que cubre la suite con PostgreSQL.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = 'd0000001-0000-4000-8000-000000000001';
const EDGE = 'a0000001-0000-4000-8000-000000000001';

const montar = (valores: Record<string, string> = {}) => {
  let ahora = 1_000;
  const consultas: { sql: string; id: string }[] = [];
  const cliente = Object.assign(new EventEmitter(), {
    query: async (sql: string, parametros: string[]) => {
      if (sql.includes('set_config')) return { rows: [] };
      const id = parametros[0] ?? '';
      consultas.push({ sql, id });
      const valor = valores[id];
      return { rows: valor === undefined ? [] : [{ valor }] };
    },
    release: () => undefined,
  });
  const pool = Object.assign(new EventEmitter(), {
    connect: async () => cliente,
  }) as unknown as Pool;
  const rutas = new RutasDeEquiposPg(pool, () => ahora);
  return { rutas, consultas, avanzar: (ms: number) => void (ahora += ms) };
};

describe('TODO_DIRECTO (R1, sin base)', () => {
  it('todo va directo: sin puente para ningún equipo ni copropiedad', async () => {
    expect(await TODO_DIRECTO.puenteDe(EQUIPO)).toBeNull();
    expect(await TODO_DIRECTO.edgeDe(COP)).toBeNull();
    expect(TODO_DIRECTO.olvidar()).toBeUndefined();
    expect(TODO_DIRECTO.olvidar(EQUIPO)).toBeUndefined();
  });
});

describe('RutasDeEquiposPg · la memoria (R1)', () => {
  it('puenteDe y edgeDe leen de la base la copropiedad y el Edge puente', async () => {
    const m = montar({ [EQUIPO]: COP, [COP]: EDGE });
    expect(await m.rutas.puenteDe(EQUIPO)).toBe(COP);
    expect(await m.rutas.edgeDe(COP)).toBe(EDGE);
    expect(m.consultas.map((c) => c.id)).toEqual([EQUIPO, COP]);
  });

  it('sin fila: null (va directo)', async () => {
    const m = montar();
    expect(await m.rutas.puenteDe(EQUIPO)).toBeNull();
    expect(await m.rutas.edgeDe(COP)).toBeNull();
  });

  it('la respuesta se recuerda 5 s; pasado ese tiempo se vuelve a leer', async () => {
    const m = montar({ [EQUIPO]: COP });
    await m.rutas.puenteDe(EQUIPO);
    m.avanzar(4_999);
    await m.rutas.puenteDe(EQUIPO);
    expect(m.consultas).toHaveLength(1);
    m.avanzar(1);
    await m.rutas.puenteDe(EQUIPO);
    expect(m.consultas).toHaveLength(2);
  });

  it('también se recuerda el «va directo» (null)', async () => {
    const m = montar();
    await m.rutas.edgeDe(COP);
    await m.rutas.edgeDe(COP);
    expect(m.consultas).toHaveLength(1);
  });

  it('un id que no es UUID no llega a la base: null', async () => {
    const m = montar({ 'cam-de-prueba': COP });
    expect(await m.rutas.puenteDe('cam-de-prueba')).toBeNull();
    expect(await m.rutas.edgeDe('no-es-uuid')).toBeNull();
    expect(m.consultas).toEqual([]);
  });

  it('olvidar(equipo) suelta sólo ese equipo; olvidar() lo suelta todo', async () => {
    const m = montar({ [EQUIPO]: COP, [COP]: EDGE });
    await m.rutas.puenteDe(EQUIPO);
    await m.rutas.edgeDe(COP);
    m.rutas.olvidar(EQUIPO);
    await m.rutas.puenteDe(EQUIPO);
    await m.rutas.edgeDe(COP);
    expect(m.consultas.map((c) => c.id)).toEqual([EQUIPO, COP, EQUIPO]);
    m.rutas.olvidar();
    await m.rutas.puenteDe(EQUIPO);
    await m.rutas.edgeDe(COP);
    expect(m.consultas.map((c) => c.id)).toEqual([EQUIPO, COP, EQUIPO, EQUIPO, COP]);
  });

  it('puenteDe y edgeDe se recuerdan con claves distintas: uno no responde por el otro', async () => {
    const m = montar({ [COP]: EDGE });
    expect(await m.rutas.edgeDe(COP)).toBe(EDGE);
    expect(await m.rutas.puenteDe(COP)).toBe(EDGE);
    expect(m.consultas).toHaveLength(2);
    expect(m.consultas[1]?.sql).toContain('public.dispositivos');
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { Bitacora } from '@ncr/domain-core';
import type { Configuracion } from '../configuracion/esquema';
import { CONEXIONES_A_PRECALENTAR, PrecalentamientoDelPool } from './precalentamiento';

const montar = (opciones: { persistencia?: string; max?: number; falla?: boolean } = {}) => {
  const consultas: string[] = [];
  const liberadas = vi.fn();
  const pool = {
    connect: vi.fn(async () => {
      if (opciones.falla === true) throw new Error('sin base');
      return { query: async (q: string) => void consultas.push(q), release: liberadas };
    }),
  } as unknown as Pool;
  const lineas: { nivel: string; datos: Record<string, unknown> }[] = [];
  const bitacora = {
    registrar: (nivel: string, _m: string, datos: Record<string, unknown>) =>
      void lineas.push({ nivel, datos }),
  } as unknown as Bitacora;
  let t = 0;
  const pre = new PrecalentamientoDelPool(
    pool,
    {
      PERSISTENCIA_DE_EVENTOS: opciones.persistencia ?? 'postgres',
      PG_POOL_MAX: opciones.max ?? 20,
    } as unknown as Configuracion,
    bitacora,
    { ahora: () => new Date((t += 40)) },
  );
  return { pre, pool, consultas, liberadas, lineas };
};

describe('F2 · el pool, caliente antes del primer rostro', () => {
  it('abre varias conexiones con SELECT 1, las devuelve y dice cuánto tardó', async () => {
    const m = montar();
    await m.pre.onApplicationBootstrap();
    expect(m.consultas).toEqual(Array(CONEXIONES_A_PRECALENTAR).fill('SELECT 1'));
    expect(m.liberadas).toHaveBeenCalledTimes(CONEXIONES_A_PRECALENTAR);
    expect(m.lineas[0]).toMatchObject({ nivel: 'info', datos: { abiertas: 4, fallidas: 0 } });
    expect(m.lineas[0]?.datos['duracionMs']).toBeTypeOf('number');
  });

  it('nunca más que el tope del pool', async () => {
    const m = montar({ max: 2 });
    expect(await m.pre.precalentar()).toEqual({ abiertas: 2, fallidas: 0 });
  });

  it('sin base no impide arrancar: queda un aviso con el error', async () => {
    const m = montar({ falla: true });
    await expect(m.pre.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(m.lineas[0]).toMatchObject({
      nivel: 'aviso',
      datos: { fallidas: 4, error: 'sin base' },
    });
  });

  it('en memoria no toca el pool', async () => {
    const m = montar({ persistencia: 'memoria' });
    await m.pre.onApplicationBootstrap();
    expect(m.pool.connect).not.toHaveBeenCalled();
  });
});

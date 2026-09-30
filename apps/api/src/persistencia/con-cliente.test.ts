import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import {
  BaseDeDatosNoDisponible,
  conCliente,
  esErrorDeConexion,
  motivoSinSecretos,
  saludDe,
  vigilarPool,
} from './con-cliente';

/** Un cliente de `pg` de mentira: un EventEmitter con `query` y `release`. */
const clienteDePrueba = () => {
  const cliente = Object.assign(new EventEmitter(), {
    query: vi.fn(async () => ({ rows: [] })),
    release: vi.fn(),
  });
  return cliente;
};

const poolCon = (cliente: ReturnType<typeof clienteDePrueba> | Error) =>
  Object.assign(new EventEmitter(), {
    connect: vi.fn(async () => {
      if (cliente instanceof Error) throw cliente;
      return cliente;
    }),
  }) as unknown as Pool;

const corte = () => Object.assign(new Error('Connection terminated unexpectedly'), {});

describe('15-O · esErrorDeConexion', () => {
  it.each([
    ['ECONNRESET', { code: 'ECONNRESET' }],
    ['57P01 (terminada por la administración)', { code: '57P01' }],
    ['53300 (demasiadas conexiones)', { code: '53300' }],
    ['el mensaje de pg', new Error('Connection terminated unexpectedly')],
    [
      'el pooler de Supabase lleno',
      new Error('EMAXCONNSESSION max clients reached in session mode'),
    ],
    ['el tiempo de espera del pool', new Error('timeout exceeded when trying to connect')],
    ['la propia BaseDeDatosNoDisponible', new BaseDeDatosNoDisponible(new Error('x'))],
  ])('reconoce %s', (_n, error) => {
    expect(esErrorDeConexion(error)).toBe(true);
  });

  it.each([
    ['una violación de unicidad', { code: '23505' }],
    ['un error del programa', new TypeError('x is undefined')],
    ['null', null],
    ['un texto', 'Connection terminated'],
  ])('no confunde %s con un corte', (_n, error) => {
    expect(esErrorDeConexion(error)).toBe(false);
  });
});

describe('15-O · conCliente', () => {
  it('devuelve el cliente sano al pool y quita su oyente', async () => {
    const c = clienteDePrueba();
    const pool = poolCon(c);
    expect(await conCliente(pool, async () => 7)).toBe(7);
    expect(c.release).toHaveBeenCalledOnce();
    expect(c.release.mock.calls[0]?.[0]).toBeUndefined();
    expect(c.listenerCount('error')).toBe(0);
    expect(saludDe(pool).ultimaConexionSana).toBeInstanceOf(Date);
  });

  it("un 'error' emitido durante el préstamo NO se escapa y la conexión se descarta", async () => {
    const c = clienteDePrueba();
    const pool = poolCon(c);
    const e = corte();
    const promesa = conCliente(pool, async () => {
      // Lo que hace pg al perder el socket: emite 'error' y rechaza la consulta.
      c.emit('error', e);
      throw e;
    });
    await expect(promesa).rejects.toBeInstanceOf(BaseDeDatosNoDisponible);
    expect(c.release).toHaveBeenCalledWith(e);
    expect(c.listenerCount('error')).toBe(0);
    expect(saludDe(pool).ultimoCorte?.motivo).toMatch(/Connection terminated/);
  });

  it('un error de conexión sin evento también descarta el cliente', async () => {
    const c = clienteDePrueba();
    const e = Object.assign(new Error('terminating connection due to administrator command'), {
      code: '57P01',
    });
    await expect(
      conCliente(poolCon(c), async () => {
        throw e;
      }),
    ).rejects.toMatchObject({ name: 'BaseDeDatosNoDisponible', causa: e });
    expect(c.release).toHaveBeenCalledWith(e);
  });

  it('un error de NEGOCIO sale tal cual y el cliente vuelve al pool', async () => {
    const c = clienteDePrueba();
    const unicidad = Object.assign(new Error('duplicate key'), { code: '23505' });
    await expect(
      conCliente(poolCon(c), async () => {
        throw unicidad;
      }),
    ).rejects.toBe(unicidad);
    expect(c.release).toHaveBeenCalledWith(undefined);
  });

  it('una BaseDeDatosNoDisponible anidada no se envuelve dos veces', async () => {
    const c = clienteDePrueba();
    const interna = new BaseDeDatosNoDisponible(corte());
    await expect(
      conCliente(poolCon(c), async () => {
        throw interna;
      }),
    ).rejects.toBe(interna);
  });

  it('si la conexión se cortó DESPUÉS de la última consulta, el resultado sale y el cliente se descarta', async () => {
    const c = clienteDePrueba();
    const pool = poolCon(c);
    const e = corte();
    expect(
      await conCliente(pool, async () => {
        c.emit('error', e);
        return 'hecho';
      }),
    ).toBe('hecho');
    expect(c.release).toHaveBeenCalledWith(e);
  });

  it('sin conexión posible: BaseDeDatosNoDisponible, y el pool lo anota', async () => {
    const pool = poolCon(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    );
    await expect(conCliente(pool, async () => 1)).rejects.toBeInstanceOf(BaseDeDatosNoDisponible);
    expect(saludDe(pool).ultimoCorte).not.toBeNull();
  });

  it('un fallo de connect que NO es de conexión sale tal cual', async () => {
    const raro = new TypeError('configuración inválida');
    await expect(conCliente(poolCon(raro), async () => 1)).rejects.toBe(raro);
  });
});

describe('15-O · vigilarPool', () => {
  it("escucha 'error' en el pool: registra sin la cadena de conexión y no lanza", () => {
    const pool = new EventEmitter() as unknown as Pool;
    const registrar = vi.fn();
    vigilarPool(pool, registrar);
    expect(() =>
      pool.emit(
        'error',
        new Error('falló postgresql://usuario:clave@servidor:5432/base'),
        {} as PoolClient,
      ),
    ).not.toThrow();
    expect(registrar).toHaveBeenCalledWith('falló <cadena de conexión>');
    expect(saludDe(pool).ultimoCorte?.motivo).toBe('falló <cadena de conexión>');
  });

  it('un pool sin historia no tiene cortes ni conexiones sanas', () => {
    expect(saludDe(new EventEmitter() as unknown as Pool)).toEqual({
      ultimoCorte: null,
      ultimaConexionSana: null,
    });
  });

  it('motivoSinSecretos acepta lo que no es un Error y lo acota', () => {
    expect(motivoSinSecretos('x'.repeat(500))).toHaveLength(200);
  });
});

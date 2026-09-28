import { describe, expect, it, vi } from 'vitest';
import type { EquipoRegistrado, RegistroDeEquipos } from './registro-de-equipos';
import { RegistroEnCache } from './registro-en-cache';

const EQUIPO = { dispositivoId: 'terminal-1', tipo: 'terminal' } as unknown as EquipoRegistrado;

const montar = (equipo: EquipoRegistrado | null = EQUIPO) => {
  let t = 1_000;
  const fuente = {
    buscar: vi.fn(async () => equipo),
    olvidar: vi.fn(),
  } satisfies RegistroDeEquipos;
  const cache = new RegistroEnCache(fuente, () => t, 30_000);
  return { fuente, cache, avanzar: (ms: number) => (t += ms) };
};

describe('F2 · el registro de equipos, recordado un rato', () => {
  it('dentro de su vida, la segunda búsqueda no va a la base', async () => {
    const { fuente, cache, avanzar } = montar();
    expect(await cache.buscar('terminal-1')).toBe(EQUIPO);
    avanzar(29_999);
    expect(await cache.buscar('terminal-1')).toBe(EQUIPO);
    expect(fuente.buscar).toHaveBeenCalledTimes(1);
  });

  it('pasada su vida, vuelve a preguntar', async () => {
    const { fuente, cache, avanzar } = montar();
    await cache.buscar('terminal-1');
    avanzar(30_000);
    await cache.buscar('terminal-1');
    expect(fuente.buscar).toHaveBeenCalledTimes(2);
  });

  it('«no está» nunca se recuerda: un equipo recién dado de alta se ve ya', async () => {
    const { fuente, cache } = montar(null);
    expect(await cache.buscar('nuevo')).toBeNull();
    expect(await cache.buscar('nuevo')).toBeNull();
    expect(fuente.buscar).toHaveBeenCalledTimes(2);
  });

  it('olvidar lo tira en el acto y avisa a la fuente', async () => {
    const { fuente, cache } = montar();
    await cache.buscar('terminal-1');
    cache.olvidar('terminal-1');
    await cache.buscar('terminal-1');
    expect(fuente.buscar).toHaveBeenCalledTimes(2);
    expect(fuente.olvidar).toHaveBeenCalledWith('terminal-1');
  });

  it('una fuente sin olvidar también sirve', async () => {
    const cache = new RegistroEnCache({ buscar: async () => EQUIPO });
    expect(await cache.buscar('x')).toBe(EQUIPO);
    expect(() => cache.olvidar('x')).not.toThrow();
  });
});

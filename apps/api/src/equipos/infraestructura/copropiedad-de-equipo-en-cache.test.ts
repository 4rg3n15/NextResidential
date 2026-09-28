import { describe, expect, it, vi } from 'vitest';
import { CopropiedadDeEquipoEnCache } from './copropiedad-de-equipo-en-cache';

const montar = (respuesta: string | null = 'cop-1') => {
  let t = 0;
  const fuente = { copropiedadDe: vi.fn(async () => respuesta) };
  const cache = new CopropiedadDeEquipoEnCache(fuente, () => t, 30_000);
  return { fuente, cache, avanzar: (ms: number) => (t += ms) };
};

describe('F2 · de quién es el equipo, recordado un rato', () => {
  it('en ráfaga no vuelve a la base; pasada su vida, sí', async () => {
    const { fuente, cache, avanzar } = montar();
    expect(await cache.copropiedadDe('t-1')).toBe('cop-1');
    avanzar(29_999);
    expect(await cache.copropiedadDe('t-1')).toBe('cop-1');
    expect(fuente.copropiedadDe).toHaveBeenCalledTimes(1);
    avanzar(1);
    await cache.copropiedadDe('t-1');
    expect(fuente.copropiedadDe).toHaveBeenCalledTimes(2);
  });

  it('«de nadie» no se recuerda, y olvidar suelta en el acto', async () => {
    const nadie = montar(null);
    await nadie.cache.copropiedadDe('t-2');
    await nadie.cache.copropiedadDe('t-2');
    expect(nadie.fuente.copropiedadDe).toHaveBeenCalledTimes(2);

    const { fuente, cache } = montar();
    await cache.copropiedadDe('t-1');
    cache.olvidar('t-1');
    await cache.copropiedadDe('t-1');
    expect(fuente.copropiedadDe).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { POLITICA_DE_PUBLICACION, publicarConEspera } from './publicacion-con-espera';

const medio = (esperas: number[]) => ({
  esperar: async (ms: number) => void esperas.push(ms),
  azar: () => 0.5,
});

describe('15-P · 0.2 · publicar sin detener el bombeo', () => {
  it('a la primera: publicado, sin esperas', async () => {
    const esperas: number[] = [];
    const r = await publicarConEspera(
      async () => undefined,
      new AbortController().signal,
      medio(esperas),
      vi.fn(),
    );
    expect(r).toBe('publicado');
    expect(esperas).toEqual([]);
  });

  it('la base falla dos veces y luego entra: espera creciente con dispersión', async () => {
    const esperas: number[] = [];
    let n = 0;
    const alFallar = vi.fn();
    const r = await publicarConEspera(
      async () => {
        n += 1;
        if (n < 3) throw new Error('Connection terminated unexpectedly');
      },
      new AbortController().signal,
      medio(esperas),
      alFallar,
    );
    expect(r).toBe('publicado');
    expect(esperas).toEqual([100, 200]);
    expect(alFallar).toHaveBeenCalledTimes(2);
  });

  it('si nunca entra: «perdido» tras los intentos de la política, sin esperar tras el último', async () => {
    const esperas: number[] = [];
    const r = await publicarConEspera(
      async () => {
        throw new Error('siempre');
      },
      new AbortController().signal,
      medio(esperas),
      vi.fn(),
    );
    expect(r).toBe('perdido');
    expect(esperas).toHaveLength(POLITICA_DE_PUBLICACION.intentos - 1);
    expect(Math.max(...esperas)).toBeLessThanOrEqual(POLITICA_DE_PUBLICACION.esperaMaximaMs);
  });

  it('cancelado durante la espera: no vuelve a intentar', async () => {
    const control = new AbortController();
    const publicar = vi.fn(async () => {
      throw new Error('x');
    });
    const r = await publicarConEspera(
      publicar,
      control.signal,
      { esperar: async () => control.abort(), azar: () => 0 },
      vi.fn(),
    );
    expect(r).toBe('cancelado');
    expect(publicar).toHaveBeenCalledTimes(1);
  });
});

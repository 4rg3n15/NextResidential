import { describe, expect, it } from 'vitest';
import { percentil, resumirMuestras } from './percentiles';

describe('percentil', () => {
  it('sin muestras devuelve null, que NO es cero', () => {
    // La distinción es la que evita que un tablero recién arrancado se lea
    // como si estuviera cumpliendo: «no ha pasado nada» ≠ «tardó nada».
    expect(percentil([], 95)).toBeNull();
    expect(resumirMuestras([])).toEqual({
      muestras: 0,
      p50: null,
      p95: null,
      p99: null,
      maximo: null,
    });
  });

  it('nunca devuelve un valor que no se haya medido', () => {
    // Con interpolación lineal el p95 de estas diez muestras daría 95,5, una
    // latencia que nadie experimentó. Aquí sale 100, que sí ocurrió.
    const muestras = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(muestras).toContain(percentil(muestras, 95));
    expect(percentil(muestras, 95)).toBe(100);
  });

  it('p50 de diez muestras es la quinta ordenada', () => {
    expect(percentil([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
  });

  it('acota los extremos en vez de salirse del array', () => {
    expect(percentil([7, 9], 0)).toBe(7);
    expect(percentil([7, 9], -5)).toBe(7);
    expect(percentil([7, 9], 100)).toBe(9);
    expect(percentil([7, 9], 140)).toBe(9);
  });

  it('una sola muestra es su propio p50, p95 y p99', () => {
    expect(resumirMuestras([42])).toEqual({
      muestras: 1,
      p50: 42,
      p95: 42,
      p99: 42,
      maximo: 42,
    });
  });

  it('ordena una COPIA: el orden de llegada del anillo no se destruye', () => {
    const llegada = [300, 100, 200];
    resumirMuestras(llegada);
    expect(llegada).toEqual([300, 100, 200]);
  });

  it('ordena numéricamente y no como texto', () => {
    // `[].sort()` sin comparador pondría 100 antes que 20, y el máximo saldría 90.
    expect(resumirMuestras([20, 100, 90]).maximo).toBe(100);
  });

  it('el p99 destapa la cola que la media esconde', () => {
    // 980 peticiones de 30 ms y 20 de 9 s: media 209 ms, p50 30 ms, p99 9 s.
    const muestras = [
      ...Array.from({ length: 980 }, () => 30),
      ...Array.from({ length: 20 }, () => 9000),
    ];
    const media = muestras.reduce((a, b) => a + b, 0) / muestras.length;
    const r = resumirMuestras(muestras);
    expect(Math.round(media)).toBe(209);
    expect(r.p50).toBe(30);
    expect(r.p99).toBe(9000);
  });
});

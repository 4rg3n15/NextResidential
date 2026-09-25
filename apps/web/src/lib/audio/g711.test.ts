import { describe, expect, it } from 'vitest';
import {
  codificar,
  codificarAlaw,
  codificarUlaw,
  decodificar,
  decodificarAlaw,
  decodificarUlaw,
  formatoG711De,
  remuestrear,
} from './g711';

/**
 * El códec se prueba por lo que importa: que ida y vuelta conserven la voz
 * (error acotado, que es lo que G.711 promete), que los extremos no se
 * desborden y que el formato anunciado por el equipo se reconozca con sus
 * grafías. Sin AudioContext: aquí no hay navegador.
 */
describe('G.711 µ-law', () => {
  it('ida y vuelta conserva la muestra dentro del error de cuantización', () => {
    for (const m of [0, 1, -1, 100, -100, 1000, -1000, 8000, -8000, 30_000, -30_000]) {
      const vuelta = decodificarUlaw(codificarUlaw(m));
      // El paso de cuantización crece con la amplitud: ~1/16 del valor.
      expect(Math.abs(vuelta - m)).toBeLessThanOrEqual(Math.max(8, Math.abs(m) / 16));
    }
  });

  it('el silencio codifica a 0xFF y los extremos no se desbordan', () => {
    expect(codificarUlaw(0)).toBe(0xff);
    expect(codificarUlaw(32_767)).toBe(0x80);
    expect(codificarUlaw(-32_768)).toBe(0x00);
    expect(decodificarUlaw(0x80)).toBeGreaterThan(30_000);
    expect(decodificarUlaw(0x00)).toBeLessThan(-30_000);
  });
});

describe('G.711 A-law', () => {
  it('ida y vuelta conserva la muestra dentro del error de cuantización', () => {
    for (const m of [0, 50, -50, 500, -500, 5000, -5000, 20_000, -20_000]) {
      const vuelta = decodificarAlaw(codificarAlaw(m));
      expect(Math.abs(vuelta - m)).toBeLessThanOrEqual(Math.max(16, Math.abs(m) / 16));
    }
  });
});

describe('formato anunciado por el equipo', () => {
  it.each([
    ['g711u', 'g711u'],
    ['G.711ulaw', 'g711u'],
    ['PCMU', 'g711u'],
    ['g711a', 'g711a'],
    ['G.711alaw', 'g711a'],
  ])('%s → %s', (anunciado, esperado) => {
    expect(formatoG711De(anunciado)).toBe(esperado);
  });

  it('lo que no conoce no se reproduce: null, nunca una suposición', () => {
    expect(formatoG711De('aac')).toBeNull();
    expect(formatoG711De(null)).toBeNull();
  });
});

describe('bloques de muestras', () => {
  it('codificar y decodificar un bloque conserva la forma de onda', () => {
    const onda = new Float32Array(160);
    for (let i = 0; i < onda.length; i += 1) onda[i] = Math.sin((i / 160) * 2 * Math.PI) * 0.5;
    const vuelta = decodificar('g711u', codificar('g711u', onda));
    let error = 0;
    for (let i = 0; i < onda.length; i += 1) error += Math.abs((vuelta[i] ?? 0) - (onda[i] ?? 0));
    expect(error / onda.length).toBeLessThan(0.01);
  });

  it('remuestrear 48 kHz → 8 kHz deja una sexta parte de las muestras, y 8 → 48 las multiplica', () => {
    const entrada = new Float32Array(480).fill(0.25);
    expect(remuestrear(entrada, 48_000, 8000)).toHaveLength(80);
    expect(remuestrear(new Float32Array(80).fill(0.25), 8000, 48_000)).toHaveLength(480);
    expect(remuestrear(entrada, 8000, 8000)).toBe(entrada);
  });
});

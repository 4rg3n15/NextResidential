import { describe, expect, it } from 'vitest';
import { estadoPorLatido, umbralCoherente, UMBRAL_DE_LATIDO_POR_DEFECTO } from './latido';
import type { UmbralDeLatido } from './latido';

const AHORA = new Date('2026-09-08T14:00:00Z');
const haceSegundos = (s: number): Date => new Date(AHORA.getTime() - s * 1000);

describe('estadoPorLatido · P-06 resuelta con umbral conservador y configurable', () => {
  it('el valor por defecto es 60 s de periodo, 1 latido tolerado, 300 s para caído', () => {
    expect(UMBRAL_DE_LATIDO_POR_DEFECTO).toEqual({
      periodoSegundos: 60,
      latidosTolerados: 1,
      silencioParaCaidoSegundos: 300,
    });
  });

  it('un dispositivo que nunca latió se da por caído, no por sano', () => {
    expect(estadoPorLatido(null, AHORA)).toBe('caido');
  });

  it('latido reciente: saludable', () => {
    expect(estadoPorLatido(haceSegundos(30), AHORA)).toBe('saludable');
  });

  it('el borde del margen tolerado sigue siendo saludable', () => {
    // 60 s × (1 tolerado + 1) = 120 s exactos.
    expect(estadoPorLatido(haceSegundos(120), AHORA)).toBe('saludable');
  });

  it('un segundo más allá del margen: degradado', () => {
    expect(estadoPorLatido(haceSegundos(121), AHORA)).toBe('degradado');
  });

  it('degradado no llega a caído hasta agotar el silencio', () => {
    expect(estadoPorLatido(haceSegundos(299), AHORA)).toBe('degradado');
  });

  it('el borde exacto del silencio ya es caído', () => {
    expect(estadoPorLatido(haceSegundos(300), AHORA)).toBe('caido');
  });

  it('admite un umbral propio de la copropiedad', () => {
    const estricto: UmbralDeLatido = {
      periodoSegundos: 10,
      latidosTolerados: 0,
      silencioParaCaidoSegundos: 30,
    };
    expect(estadoPorLatido(haceSegundos(15), AHORA, estricto)).toBe('degradado');
    expect(estadoPorLatido(haceSegundos(31), AHORA, estricto)).toBe('caido');
  });

  it('un latido en el futuro no rompe el cálculo: sigue saludable', () => {
    expect(estadoPorLatido(new Date(AHORA.getTime() + 5_000), AHORA)).toBe('saludable');
  });
});

describe('umbralCoherente · un umbral mal puesto haría inalcanzable `degradado`', () => {
  it('el valor por defecto es coherente', () => {
    expect(umbralCoherente(UMBRAL_DE_LATIDO_POR_DEFECTO)).toBe(true);
  });

  it('rechaza el silencio menor que el margen tolerado', () => {
    expect(
      umbralCoherente({ periodoSegundos: 60, latidosTolerados: 5, silencioParaCaidoSegundos: 120 }),
    ).toBe(false);
  });

  it('rechaza un periodo no positivo', () => {
    expect(
      umbralCoherente({ periodoSegundos: 0, latidosTolerados: 1, silencioParaCaidoSegundos: 300 }),
    ).toBe(false);
  });

  it('rechaza latidos tolerados negativos', () => {
    expect(
      umbralCoherente({
        periodoSegundos: 60,
        latidosTolerados: -1,
        silencioParaCaidoSegundos: 300,
      }),
    ).toBe(false);
  });
});

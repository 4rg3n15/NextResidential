import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { documentoDeLaCorrida } from './documento-de-la-corrida';

/**
 * D-148 · el documento de un visitante de prueba no se repite entre corridas
 * distintas. Sin base: es la fórmula lo que se prueba.
 */
describe('documentoDeLaCorrida', () => {
  it('las dos corridas que chocaban dan ahora documentos distintos', () => {
    // Con la fórmula anterior (cada letra, un 7) las dos daban `9070707…`.
    const antes = (corrida: string, n: number): string =>
      `9${corrida.replace(/\D/g, '7')}${String(n)}`.slice(0, 12);
    expect(antes('0A0A0A', 1)).toBe(antes('0B0C0D', 1));

    expect(documentoDeLaCorrida('9', '0A0A0A', 1)).not.toBe(documentoDeLaCorrida('9', '0B0C0D', 1));
  });

  it('dos corridas distintas nunca comparten un documento, sea cual sea `n`', () => {
    const corridas = new Set<string>();
    while (corridas.size < 2_000) corridas.add(randomBytes(3).toString('hex').toUpperCase());
    const vistos = new Map<string, string>();
    for (const corrida of corridas) {
      for (const n of [0, 1, 9, 10, 11, 99]) {
        const documento = documentoDeLaCorrida('9', corrida, n);
        expect(vistos.get(documento), documento).toBeUndefined();
        vistos.set(documento, corrida);
      }
    }
  });

  it('cabe en el DTO (4 a 32) y en la restricción de la base (4 a 20, sólo cifras y letras)', () => {
    for (const corrida of ['000000', 'FFFFFF', '0A0A0A']) {
      for (const n of [0, 99]) {
        const documento = documentoDeLaCorrida('8', corrida, n);
        expect(documento).toMatch(/^[A-Z0-9]{4,20}$/);
        expect(documento).toHaveLength(11);
      }
    }
    expect(documentoDeLaCorrida('9', 'FFFFFF', 7)).toBe('91677721507');
  });

  it('rechaza una corrida o un número fuera de forma, en vez de inventar un documento', () => {
    expect(() => documentoDeLaCorrida('9', 'abcdef', 1)).toThrow(/seis cifras hexadecimales/);
    expect(() => documentoDeLaCorrida('9', '0A0A0A0A', 1)).toThrow(/seis cifras hexadecimales/);
    expect(() => documentoDeLaCorrida('9', '0A0A0A', 100)).toThrow(/de 0 a 99/);
    expect(() => documentoDeLaCorrida('9', '0A0A0A', -1)).toThrow(/de 0 a 99/);
    expect(() => documentoDeLaCorrida('9', '0A0A0A', 1.5)).toThrow(/de 0 a 99/);
  });
});

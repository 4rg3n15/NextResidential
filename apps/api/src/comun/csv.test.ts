import { describe, expect, it } from 'vitest';
import { escaparCsv, neutralizarFormula } from './csv';

/**
 * H-13-15 · la inyección de fórmulas estaba resuelta en el exportador de
 * eventos y OLVIDADA en el del padrón. La regla vive ahora en un solo sitio;
 * esta prueba es la que impide que vuelva a divergir.
 */
describe('neutralizarFormula', () => {
  it('antepone un apóstrofo a lo que Excel evaluaría como fórmula', () => {
    for (const inicio of ['=', '+', '-', '@', '\t', '\r']) {
      expect(neutralizarFormula(`${inicio}HYPERLINK("http://malo.example","ver")`)).toBe(
        `'${inicio}HYPERLINK("http://malo.example","ver")`,
      );
    }
  });

  it('no toca lo que no empieza por un carácter peligroso', () => {
    expect(neutralizarFormula('Casa 101')).toBe('Casa 101');
    expect(neutralizarFormula('')).toBe('');
    // El peligro está en el PRIMER carácter: dentro no hay fórmula que abrir.
    expect(neutralizarFormula('Torre A = 3')).toBe('Torre A = 3');
  });
});

describe('escaparCsv', () => {
  it('entrecomilla siempre y duplica la comilla interna (RFC 4180)', () => {
    expect(escaparCsv('sin nada')).toBe('"sin nada"');
    expect(escaparCsv('con "comilla"')).toBe('"con ""comilla"""');
  });

  it('y la fórmula queda neutralizada DENTRO del entrecomillado', () => {
    // El entrecomillado por sí solo no protege: Excel lo deshace al abrir.
    expect(escaparCsv('=1+1')).toBe(`"'=1+1"`);
  });
});

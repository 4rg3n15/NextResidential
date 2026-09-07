import { describe, expect, it } from 'vitest';
import { Placa } from './placa';
import { esExito, esFallo } from '../compartido/resultado';

const valor = (e: string): string => {
  const r = Placa.crear(e);
  if (!esExito(r)) throw new Error(`esperaba éxito para "${e}"`);
  return r.valor.valor;
};

describe('VO Placa · normalización al construir (RN-04)', () => {
  it('colapsa a una sola forma las escrituras equivalentes', () => {
    // Todas son el mismo coche. Sin esta normalización el índice único de la
    // base vería cinco filas distintas y RN-04 dejaría de existir.
    for (const entrada of [
      'abc123',
      'ABC123',
      'abc-123',
      'ABC 123',
      ' a b c 1 2 3 ',
      'abc.123',
      'abc_123',
    ]) {
      expect(valor(entrada), entrada).toBe('ABC123');
    }
  });

  it('pliega variantes de ancho completo (NFKC)', () => {
    expect(valor('ＡＢＣ１２３')).toBe('ABC123');
  });

  it('la forma normalizada satisface el CHECK de la base', () => {
    expect(/^[A-Z0-9]{5,8}$/.test(valor('abc-123'))).toBe(true);
  });

  it('RECHAZA en vez de limpiar lo que no reconoce', () => {
    // Borrar caracteres desconocidos convertiría `ABC12Ω3` en otra placa válida.
    for (const malo of ['ABC12Ω3', 'ABC/123', 'ABС123', 'ABC+123']) {
      expect(esFallo(Placa.crear(malo)), malo).toBe(true);
    }
  });

  it('rechaza longitudes fuera de rango tras normalizar', () => {
    expect(esFallo(Placa.crear('AB-1'))).toBe(true);
    expect(esFallo(Placa.crear('ABC123456'))).toBe(true);
    expect(esFallo(Placa.crear('   '))).toBe(true);
  });

  it('rechaza entradas que no son texto', () => {
    expect(esFallo(Placa.crear(null as unknown as string))).toBe(true);
    expect(esFallo(Placa.crear(123 as unknown as string))).toBe(true);
  });

  it('equivale compara la forma normalizada', () => {
    const a = Placa.crear('abc-123');
    const b = Placa.crear('ABC 123');
    if (!esExito(a) || !esExito(b)) throw new Error('ambas deberían ser válidas');
    expect(a.valor.equivale(b.valor)).toBe(true);
    expect(`${a.valor}`).toBe('ABC123');
  });
});

import { describe, expect, it } from 'vitest';
import { CODIGOS_DE_CONFLICTO, esCodigoDeConflicto } from './conflictos';

describe('códigos de conflicto (15-Z2, DT-15W-01, DT-15X-09)', () => {
  it('son únicos, en mayúsculas y sin espacios: van tal cual en el contrato', () => {
    expect(new Set(CODIGOS_DE_CONFLICTO).size).toBe(CODIGOS_DE_CONFLICTO.length);
    for (const c of CODIGOS_DE_CONFLICTO) expect(c).toMatch(/^[A-Z][A-Z_]+$/);
  });
  it('los de la 15-W y la 15-X que la consola y la app deciden existen', () => {
    for (const c of [
      'VIVIENDA_CON_TITULAR',
      'USUARIO_NO_DISPONIBLE',
      'CUENTA_CON_VIVIENDA',
      'POLITICA_CAMBIADA',
      'OTRO_REGISTRO_GANO',
      'TOPE_DE_PLAZAS',
      'PLACA_CON_HISTORIAL',
    ]) {
      expect(esCodigoDeConflicto(c)).toBe(true);
    }
    expect(esCodigoDeConflicto('cualquier cosa')).toBe(false);
    expect(esCodigoDeConflicto(409)).toBe(false);
  });
});

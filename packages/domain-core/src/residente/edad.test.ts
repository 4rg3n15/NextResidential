import { describe, expect, it } from 'vitest';
import { MAYORIA_DE_EDAD, diaCivilEnBogota, edadEn, esFechaCivil, puedeTenerCuenta } from './edad';

/**
 * RONDA 15-W · D-W2 · la mayoría de edad con el día de BOGOTÁ (UTC−5). Las
 * horas van en UTC a propósito: «12:00Z» es mediodía en Bogotá menos cinco
 * horas, y «03:00Z» todavía es el día anterior allí.
 */
describe('edadEn · el día de Bogotá, con el reloj inyectado', () => {
  const mediodia = new Date('2026-10-06T17:00:00Z'); // 12:00 en Bogotá

  it('cumpleaños HOY: ya los cumplió', () => {
    expect(edadEn('2008-10-06', mediodia)).toBe(18);
  });
  it('cumpleaños AYER: también', () => {
    expect(edadEn('2008-10-05', mediodia)).toBe(18);
  });
  it('cumpleaños MAÑANA: todavía no', () => {
    expect(edadEn('2008-10-07', mediodia)).toBe(17);
  });

  it('17 años no tienen cuenta; 18 sí', () => {
    expect(puedeTenerCuenta(17)).toBe(false);
    expect(puedeTenerCuenta(MAYORIA_DE_EDAD)).toBe(true);
    expect(puedeTenerCuenta(40)).toBe(true);
  });

  it('el cambio de día: en UTC ya es el cumpleaños, en Bogotá todavía no', () => {
    // 2026-10-06 02:00Z = 2026-10-05 21:00 en Bogotá.
    const nocheEnBogota = new Date('2026-10-06T02:00:00Z');
    expect(diaCivilEnBogota(nocheEnBogota)).toBe('2026-10-05');
    expect(edadEn('2008-10-06', nocheEnBogota)).toBe(17);
    // Cinco horas después ya es el 6 también en Bogotá.
    expect(edadEn('2008-10-06', new Date('2026-10-06T05:00:00Z'))).toBe(18);
  });

  describe('29 de febrero (S-15W-06): en un año no bisiesto cumple el 1 de marzo', () => {
    it('el 28 de febrero todavía no', () => {
      expect(edadEn('2008-02-29', new Date('2026-02-28T17:00:00Z'))).toBe(17);
    });
    it('el 1 de marzo sí', () => {
      expect(edadEn('2008-02-29', new Date('2026-03-01T17:00:00Z'))).toBe(18);
    });
    it('en un año bisiesto, el mismo 29', () => {
      expect(edadEn('2010-02-29', new Date('2028-02-29T17:00:00Z'))).toBeNull();
      expect(edadEn('2012-02-29', new Date('2030-02-28T17:00:00Z'))).toBe(17);
      expect(edadEn('2012-02-29', new Date('2032-02-29T17:00:00Z'))).toBe(20);
    });
  });

  it('una fecha que no es civil, o futura, no tiene edad: nunca cuenta como mayor', () => {
    expect(edadEn('2008-02-30', mediodia)).toBeNull();
    expect(edadEn('1899-12-31', mediodia)).toBeNull();
    expect(edadEn('06/10/2008', mediodia)).toBeNull();
    expect(edadEn('2026-10-07', mediodia)).toBeNull();
    expect(esFechaCivil('2026-02-29')).toBe(false);
    expect(esFechaCivil('2028-02-29')).toBe(true);
  });
});

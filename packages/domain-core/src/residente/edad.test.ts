import { describe, expect, it } from 'vitest';
import {
  EDAD_MINIMA_ROSTRO_MENOR,
  MAYORIA_DE_EDAD,
  aptitudDelRostroDeMenor,
  cumpleMayoriaEn,
  diaCivilEnBogota,
  edadEn,
  esFechaCivil,
  puedeTenerCuenta,
} from './edad';

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

/**
 * 15-X · D3 · el rostro de un menor: desde los 15 años CUMPLIDOS (S-15W-01)
 * hasta la víspera de los 18, con el mismo día de Bogotá que la cuenta.
 */
describe('aptitudDelRostroDeMenor · de 15 cumplidos a 17', () => {
  const mediodia = new Date('2026-10-06T17:00:00Z'); // 12:00 del 6 de octubre en Bogotá

  it('15 cumplidos hoy: apto; con el cumpleaños mañana, todavía no', () => {
    expect(EDAD_MINIMA_ROSTRO_MENOR).toBe(15);
    expect(aptitudDelRostroDeMenor('2011-10-06', mediodia)).toBe('APTO');
    expect(aptitudDelRostroDeMenor('2011-10-07', mediodia)).toBe('EDAD_INSUFICIENTE');
    expect(aptitudDelRostroDeMenor('2020-01-01', mediodia)).toBe('EDAD_INSUFICIENTE');
  });

  it('17 todavía es apto; con 18 cumplidos ya es mayor', () => {
    expect(aptitudDelRostroDeMenor('2008-10-07', mediodia)).toBe('APTO');
    expect(aptitudDelRostroDeMenor('2008-10-06', mediodia)).toBe('YA_ES_MAYOR');
    expect(aptitudDelRostroDeMenor('1990-05-17', mediodia)).toBe('YA_ES_MAYOR');
  });

  it('sin fecha, con una que no es civil o con una futura: nunca apto', () => {
    for (const fecha of [null, '', '2011-02-30', '06/10/2011', '2030-01-01']) {
      expect(aptitudDelRostroDeMenor(fecha, mediodia)).toBe('SIN_FECHA');
    }
  });

  it('el día que cuenta es el de Bogotá: a las 03:00Z del cumpleaños, allí es la víspera', () => {
    expect(aptitudDelRostroDeMenor('2011-10-07', new Date('2026-10-07T03:00:00Z'))).toBe(
      'EDAD_INSUFICIENTE',
    );
    expect(aptitudDelRostroDeMenor('2011-10-07', new Date('2026-10-07T05:00:00Z'))).toBe('APTO');
  });
});

describe('cumpleMayoriaEn · las 00:00 de Bogotá del día en que cumple 18', () => {
  const instante = (fecha: string): Date => {
    const t = cumpleMayoriaEn(fecha);
    if (t === null) throw new Error(`sin instante para ${fecha}`);
    return t;
  };

  it('es el primer instante en que edadEn dice 18; un milisegundo antes, 17', () => {
    const t = instante('2008-10-07');
    expect(t.toISOString()).toBe('2026-10-07T05:00:00.000Z');
    expect(edadEn('2008-10-07', t)).toBe(MAYORIA_DE_EDAD);
    expect(edadEn('2008-10-07', new Date(t.getTime() - 1))).toBe(17);
  });

  it('29 de febrero: el 1 de marzo (S-15W-06), igual que edadEn', () => {
    // Nadie nacido un 29 de febrero cumple 18 en un año bisiesto.
    const t = instante('2008-02-29');
    expect(t.toISOString()).toBe('2026-03-01T05:00:00.000Z');
    expect(edadEn('2008-02-29', t)).toBe(MAYORIA_DE_EDAD);
    expect(edadEn('2008-02-29', new Date(t.getTime() - 1))).toBe(17);
  });

  it('el último día del año pasa al siguiente sin perder el día', () => {
    expect(instante('2009-12-31').toISOString()).toBe('2027-12-31T05:00:00.000Z');
  });

  it('una fecha que no es civil no tiene instante', () => {
    expect(cumpleMayoriaEn('2008-02-30')).toBeNull();
    expect(cumpleMayoriaEn('')).toBeNull();
  });
});

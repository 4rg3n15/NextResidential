import { describe, expect, it } from 'vitest';
import { minutosDeHora, problemaDePatron, problemaDeVigencia } from './vigencia';

const AHORA = new Date('2026-09-13T12:00:00.000Z');

describe('problemaDeVigencia', () => {
  it('señala el caso EXACTO que se aceptó en D-73: termina antes de empezar', () => {
    // «Desde 13/09/2026 05:45 p. m.» y «Hasta 13/09/2026 05:45 a. m.».
    const problema = problemaDeVigencia('2026-09-13T17:45', '2026-09-13T05:45', AHORA);
    expect(problema).toMatch(/termina antes de empezar/);
  });

  it('rechaza el intervalo de duración cero, igual que el dominio', () => {
    // `Vigencia` es cerrado-abierto `[desde, hasta)`: con los dos iguales no
    // contiene ningún instante.
    expect(problemaDeVigencia('2026-09-14T08:00', '2026-09-14T08:00', AHORA)).not.toBeNull();
  });

  it('acepta un minuto de vigencia en el futuro', () => {
    expect(problemaDeVigencia('2026-09-14T08:00', '2026-09-14T08:01', AHORA)).toBeNull();
  });

  it('señala la vigencia que nace expirada (RN-01)', () => {
    const problema = problemaDeVigencia('2026-09-10T08:00', '2026-09-11T08:00', AHORA);
    expect(problema).toMatch(/expirada/);
  });

  it('no dice nada mientras falte un campo: sería ruido al escribir', () => {
    expect(problemaDeVigencia('', '2026-09-14T08:00', AHORA)).toBeNull();
    expect(problemaDeVigencia('2026-09-14T08:00', '', AHORA)).toBeNull();
  });

  it('avisa de una fecha que el navegador no supo interpretar', () => {
    expect(problemaDeVigencia('no-es-fecha', '2026-09-14T08:00', AHORA)).toMatch(/inicio/);
    expect(problemaDeVigencia('2026-09-14T08:00', 'no-es-fecha', AHORA)).toMatch(/fin/);
  });
});

describe('problemaDePatron', () => {
  it('exige al menos un día, como RN-22', () => {
    expect(problemaDePatron([], '08:00', '18:00')).toMatch(/al menos un día/);
  });

  it('rechaza la franja que cruza la medianoche', () => {
    expect(problemaDePatron([1], '22:00', '02:00')).toMatch(/medianoche/);
  });

  it('rechaza la franja de duración cero y acepta la de un minuto', () => {
    expect(problemaDePatron([1], '08:00', '08:00')).not.toBeNull();
    expect(problemaDePatron([1], '08:00', '08:01')).toBeNull();
  });

  it('acepta la franja normal de 08:00 a 18:00', () => {
    expect(problemaDePatron([1, 2, 3, 4, 5], '08:00', '18:00')).toBeNull();
  });
});

describe('minutosDeHora', () => {
  it('traduce la hora del navegador a minutos del día', () => {
    expect(minutosDeHora('00:00')).toBe(0);
    expect(minutosDeHora('08:30')).toBe(510);
    expect(minutosDeHora('23:59')).toBe(1439);
  });

  it('devuelve null ante lo que no es una hora', () => {
    expect(minutosDeHora('')).toBeNull();
    expect(minutosDeHora('24:00')).toBeNull();
    expect(minutosDeHora('08:60')).toBeNull();
    expect(minutosDeHora('8:00')).toBeNull();
  });
});

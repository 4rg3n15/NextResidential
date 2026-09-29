import { describe, expect, it } from 'vitest';
import { confirmacionDePlaca, momentoCorto } from './confirmacion-de-placa';

/**
 * C9 (15-M) · la frase de confirmación de la placa es una función pura: las
 * mismas fechas producen la misma frase en la consola, en la app y en el detalle.
 */
describe('confirmacionDePlaca', () => {
  // 2026-09-28 23:56 UTC = 18:56 en Bogotá; 12 h después cruza la medianoche.
  const desde = new Date('2026-09-28T23:56:00.000Z');
  const hasta = new Date('2026-09-29T11:56:00.000Z');

  it('lleva la placa, el nombre y la FECHA en los dos extremos, en DD-MM-YYYY HH:MM', () => {
    expect(confirmacionDePlaca({ placa: 'ABC123', visitante: 'Ana Pérez', desde, hasta })).toBe(
      'Placa ABC123 registrada para la visita de Ana Pérez, del 28-09-2026 18:56 al 29-09-2026 06:56',
    );
  });

  it('sin placa no hay nada que confirmar: null (ni cadena vacía)', () => {
    expect(confirmacionDePlaca({ placa: null, visitante: 'Ana', desde, hasta })).toBeNull();
    expect(confirmacionDePlaca({ placa: '   ', visitante: 'Ana', desde, hasta })).toBeNull();
  });

  it('la medianoche se escribe 00:00, nunca 24:00, y respeta la zona pedida', () => {
    const medianoche = new Date('2026-10-01T05:00:00.000Z'); // 00:00 en Bogotá
    expect(momentoCorto(medianoche)).toBe('01-10-2026 00:00');
    expect(momentoCorto(medianoche, 'UTC')).toBe('01-10-2026 05:00');
  });

  it('un nombre vacío no deja la frase coja', () => {
    expect(confirmacionDePlaca({ placa: 'XYZ789', visitante: '  ', desde, hasta })).toContain(
      'la visita de el visitante, del',
    );
  });
});

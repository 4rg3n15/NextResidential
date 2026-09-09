import { describe, expect, it } from 'vitest';
import {
  ESPERA_BASE_MS,
  ESPERA_MAXIMA_MS,
  MARGEN_RENOVACION_MS,
  esperaDeReintento,
  msHastaRenovar,
} from './reconexion';

describe('esperaDeReintento', () => {
  it('el primer intento no espera', () => {
    expect(esperaDeReintento(0)).toBe(0);
  });

  it('crece exponencialmente hasta el tope', () => {
    const sinJitter = (n: number): number => esperaDeReintento(n, () => 1);
    expect(sinJitter(1)).toBe(ESPERA_BASE_MS);
    expect(sinJitter(2)).toBe(ESPERA_BASE_MS * 2);
    expect(sinJitter(3)).toBe(ESPERA_BASE_MS * 4);
    expect(sinJitter(20)).toBe(ESPERA_MAXIMA_MS);
  });

  it('nunca supera el tope, por muchos intentos que se acumulen', () => {
    for (let n = 1; n <= 40; n += 1) {
      expect(esperaDeReintento(n, () => 1)).toBeLessThanOrEqual(ESPERA_MAXIMA_MS);
    }
  });

  it('el jitter separa reconexiones que serían simultáneas', () => {
    // Veinticinco consolas pierden la conexión a la vez —lo normal, porque la
    // pierden por lo mismo—. Sin jitter reintentarían en el mismo milisegundo
    // y el limitador de peticiones las contaría como una ráfaga.
    const esperas = new Set(Array.from({ length: 25 }, () => esperaDeReintento(4, Math.random)));
    expect(esperas.size).toBeGreaterThan(15);
  });

  it('nunca reintenta de forma inmediata, ni con el azar en su contra', () => {
    // Sin el suelo, un `aleatorio()` cercano a cero convertiría un corte en un
    // bucle cerrado contra la API.
    expect(esperaDeReintento(1, () => 0)).toBeGreaterThanOrEqual(250);
    expect(esperaDeReintento(9, () => 0.000001)).toBeGreaterThanOrEqual(250);
  });
});

describe('msHastaRenovar', () => {
  const ahora = Date.UTC(2026, 8, 9, 12, 0, 0);

  it('se adelanta al vencimiento del token', () => {
    const expira = Math.floor(ahora / 1000) + 300;
    expect(msHastaRenovar(expira, ahora)).toBe(300_000 - MARGEN_RENOVACION_MS);
  });

  it('con el token a punto de caducar, renueva ya (pero no en cero)', () => {
    // Cero programaría un `setTimeout` inmediato en bucle si la renovación
    // fallara; cinco segundos dejan margen a que la respuesta llegue.
    expect(msHastaRenovar(Math.floor(ahora / 1000) + 5, ahora)).toBe(5_000);
    expect(msHastaRenovar(Math.floor(ahora / 1000) - 100, ahora)).toBe(5_000);
  });

  it('sin dato de expiración no programa nada', () => {
    expect(msHastaRenovar(null, ahora)).toBeNull();
  });
});

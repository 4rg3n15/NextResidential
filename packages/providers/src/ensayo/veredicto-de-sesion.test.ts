import { describe, expect, it } from 'vitest';
import { subidasRechazadas, veredictoDeSesion } from './veredicto-de-sesion';

/**
 * DT-15S4-01 (15-S6) · un 400 sólo se atribuye al `sessionId` si la misma
 * petición, sin él, obtuvo 2xx. Lo del 09/10 (C-65): 400 con él y 400 sin él.
 */
describe('veredictoDeSesion', () => {
  it('usado y «no lo dio» pasan tal cual', () => {
    expect(veredictoDeSesion('usado', ['open 200', 'PUT audioData 200'])).toBe('usado');
    expect(veredictoDeSesion('no lo dio el equipo', ['open 200'])).toBe('no lo dio el equipo');
  });

  it('rechazado y luego 200 sin él: demostrado', () => {
    expect(
      veredictoDeSesion('rechazado', [
        'open 200',
        'PUT audioData 400',
        'PUT audioData: se repite sin sessionId',
        'PUT audioData 200',
      ]),
    ).toBe('rechazado (demostrado: sin él, 2xx)');
  });

  it('el 09/10: 400 con él y 400 sin él → causa no determinada, no «rechazado»', () => {
    expect(
      veredictoDeSesion('rechazado', [
        'open 200',
        'PUT audioData 400',
        'PUT audioData: se repite sin sessionId',
        'PUT audioData 400',
        'PUT audioData 400',
      ]),
    ).toBe('400 de causa no determinada (igual sin sessionId)');
  });

  it('sin repetición posterior no hay prueba: causa no determinada', () => {
    expect(
      veredictoDeSesion('rechazado', [
        'open 200',
        'PUT audioData 400',
        'PUT audioData: se repite sin sessionId',
        'close 200',
      ]),
    ).toBe('400 de causa no determinada (no se repitió sin sessionId)');
    expect(veredictoDeSesion('rechazado', ['open 200'])).toBe(
      '400 de causa no determinada (no se repitió sin sessionId)',
    );
  });

  it('cuenta sólo los PUT audioData con 4xx', () => {
    expect(
      subidasRechazadas([
        'open 200',
        'PUT audioData 400',
        'GET audioData 403',
        'PUT audioData 403',
      ]),
    ).toBe(2);
  });
});

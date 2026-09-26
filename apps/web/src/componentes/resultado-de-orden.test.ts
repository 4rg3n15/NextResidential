import { describe, expect, it } from 'vitest';
import { resultadoDeOrden } from './resultado-de-orden';

/**
 * H-SITIO-13 · en sitio la puerta no se movió y la consola decía «Abierta».
 * Ninguna respuesta del equipo se puede leer así: sin señal de posición
 * cableada, lo máximo que se sabe es que el equipo ACEPTÓ la orden.
 */
describe('H-SITIO-13 · lo que la consola dice de una orden', () => {
  it.each([
    [
      { accion: 'abrir', resultado: 'aceptada' },
      'Aceptada por el equipo · sin confirmación de apertura',
    ],
    [{ accion: 'abrir', resultado: 'rechazada' }, 'Rechazada por el equipo'],
    [{ accion: 'abrir', resultado: 'inalcanzable' }, 'Equipo inalcanzable'],
    [{ accion: 'abrir', resultado: null }, 'Sin respuesta del equipo'],
    [{ accion: 'negar', resultado: null }, 'Negada'],
  ])('%o → %s', (orden, texto) => {
    expect(resultadoDeOrden(orden).texto).toBe(texto);
  });

  it('NINGÚN resultado dice «abierta»', () => {
    for (const resultado of ['aceptada', 'rechazada', 'inalcanzable', null]) {
      expect(resultadoDeOrden({ accion: 'abrir', resultado }).texto).not.toMatch(/^abierta/i);
    }
  });
});

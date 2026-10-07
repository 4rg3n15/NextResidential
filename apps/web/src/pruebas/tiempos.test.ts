import { describe, expect, it } from 'vitest';
import { getCurrentTest } from 'vitest/suite';
import { getConfig } from '@testing-library/react';

/**
 * El tope de una PRUEBA cubre varias esperas de Testing Library (15-X, al
 * llevar el PR #52 a verde).
 *
 * `preparacion.ts` da 5 s a CADA consulta asíncrona (ETAPA 13). Con el tope de
 * la prueba en los 5 s por omisión de Vitest, una prueba que encadena tres
 * esperas —`viviendas/generacion.test.tsx`— se cortaba antes de que venciera
 * su propia espera, y Vitest lo informa como `Error: STACK_TRACE_ERROR`: una
 * roja intermitente en el paso 14, en macOS. Se mide el tope EFECTIVO, el que
 * ve la prueba al correr, y no el fichero de configuración: así una opción que
 * lo pise en otra parte tampoco pasa desapercibida.
 */
describe('los tiempos de las pruebas de la consola', () => {
  it('el tope de una prueba alcanza para al menos tres esperas completas', () => {
    const tope = (getCurrentTest() as { timeout?: number } | undefined)?.timeout ?? 0;
    expect(tope).toBeGreaterThanOrEqual(3 * getConfig().asyncUtilTimeout);
  });
});

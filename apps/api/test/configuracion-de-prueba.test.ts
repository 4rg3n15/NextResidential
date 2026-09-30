import { describe, expect, it } from 'vitest';
import { esquemaConfiguracion } from '../src/configuracion/esquema';
import { configuracionDePrueba } from './utilidades';

/**
 * O6 (15-N) · la configuración de la suite es un literal que NO pasa por el
 * esquema, y los ficheros de prueba no entran en `tsc`. Una variable nueva con
 * valor por omisión quedaba `undefined` en todas las suites: con
 * `ALERTAS_VENTANA_DEDUP_S` la ventana valía `NaN` y ninguna prueba e2e llegó a
 * ejercitar la deduplicación de alertas. Esto lo impide para las que vengan.
 */
describe('configuración de prueba', () => {
  it('trae TODAS las variables que el esquema resuelve con un valor por omisión', () => {
    const forma = esquemaConfiguracion.shape as Record<
      string,
      { safeParse: (v: unknown) => { success: boolean; data?: unknown } }
    >;
    const faltan = Object.entries(forma)
      .filter(([, campo]) => {
        const r = campo.safeParse(undefined);
        return r.success && r.data !== undefined;
      })
      .map(([clave]) => clave)
      .filter((clave) => !(clave in configuracionDePrueba));
    expect(faltan).toEqual([]);
  });
});

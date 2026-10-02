// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import configuracion, { POLITICA_DE_LA_GUARDIA, POLITICA_SIN_MICROFONO } from '../next.config.mjs';

/**
 * 15-P · el micrófono SÓLO en la ruta de la guardia (§2.7.7). Se resuelve con
 * el mismo emparejador de rutas que usa Next para `headers()`, no con una
 * expresión escrita aquí: lo que se prueba es lo que Next aplicará.
 */
const { getPathMatch } = createRequire(import.meta.url)(
  'next/dist/shared/lib/router/utils/path-match',
) as { getPathMatch: (fuente: string) => (ruta: string) => false | object };

const politicaDe = async (ruta: string): Promise<readonly string[]> => {
  const reglas = (await configuracion.headers?.()) ?? [];
  return reglas
    .filter((r) => getPathMatch(r.source)(ruta) !== false)
    .flatMap((r) => r.headers)
    .filter((h) => h.key === 'Permissions-Policy')
    .map((h) => h.value);
};

describe('15-P · Permissions-Policy por ruta', () => {
  it('la guardia, y sus subrutas, admiten el micrófono del propio origen', async () => {
    expect(await politicaDe('/guardia')).toEqual([POLITICA_DE_LA_GUARDIA]);
    expect(await politicaDe('/guardia/otra')).toEqual([POLITICA_DE_LA_GUARDIA]);
  });

  it('el resto de la consola, no: ni portería, ni el tablero, ni una ruta que empiece igual', async () => {
    for (const ruta of [
      '/',
      '/porteria',
      '/tablero',
      '/dispositivos/x',
      '/guardias',
      '/guardia-falsa',
    ]) {
      expect(await politicaDe(ruta), ruta).toEqual([POLITICA_SIN_MICROFONO]);
    }
  });

  it('la cámara sigue cerrada también en la guardia', () => {
    expect(POLITICA_DE_LA_GUARDIA).toContain('camera=()');
    expect(POLITICA_DE_LA_GUARDIA).toContain('microphone=(self)');
  });
});

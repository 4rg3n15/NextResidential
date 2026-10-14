import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UMBRALES, umbralesDesde } from './medidas';

/**
 * 15-Y3 · los umbrales de la consola son EXACTAMENTE los del fichero
 * compartido con la app (`packages/contracts/src/umbrales-de-calidad.json`); la
 * app tiene la prueba espejo en Dart (`umbrales_compartidos_test.dart`).
 */
describe('umbrales de calidad compartidos con la app', () => {
  const fichero = JSON.parse(
    readFileSync(
      resolve(process.cwd(), '../../packages/contracts/src/umbrales-de-calidad.json'),
      'utf8',
    ),
  ) as Record<string, unknown>;

  it('la consola usa los del fichero, sin copia propia', () => {
    expect(UMBRALES).toEqual(umbralesDesde(fichero));
    expect(UMBRALES).toEqual({
      nitidezMinima: 0.45,
      iluminacionMinima: 0.25,
      iluminacionMaxima: 0.85,
      proporcionMinima: 0.15,
      proporcionMaxima: 0.75,
    });
  });

  it('un umbral que falte o salga de 0..1 no pasa en silencio', () => {
    expect(() => umbralesDesde({ ...fichero, nitidezMinima: 1.5 })).toThrow(/nitidezMinima/);
    expect(() => umbralesDesde({ ...fichero, proporcionMaxima: undefined })).toThrow(
      /proporcionMaxima/,
    );
    expect(() => umbralesDesde({ ...fichero, iluminacionMinima: '0.25' })).toThrow(
      /iluminacionMinima/,
    );
  });
});

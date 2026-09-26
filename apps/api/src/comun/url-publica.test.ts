import { describe, expect, it } from 'vitest';
import { alcanceDeLaUrlPublica, avisoDeUrlPublica } from './url-publica';

/**
 * H-SITIO-10 · en sitio `API_URL_PUBLICA=http://127.0.0.1:3000` produjo QR que
 * ningún teléfono abría. Las direcciones son de documentación (RFC 5737).
 */
/** Cualquier proveedor que no sea el simulado habla con equipos de verdad. */
const REAL = 'real';

describe('H-SITIO-10 · alcance de la URL pública', () => {
  it.each([
    ['http://127.0.0.1:3000', 'bucle_local'],
    ['http://localhost:3000', 'bucle_local'],
    ['http://api.localhost:3000', 'bucle_local'],
    ['http://[::1]:3000', 'bucle_local'],
    ['http://0.0.0.0:3000', 'bucle_local'],
    ['http://192.0.2.10:3000', 'alcanzable'],
    ['https://ncr.ejemplo.invalid', 'alcanzable'],
    [null, 'ausente'],
    ['', 'ausente'],
    ['no-es-url', 'ausente'],
  ] as const)('%s → %s', (url, esperado) => {
    expect(alcanceDeLaUrlPublica(url)).toBe(esperado);
  });

  it('el arranque lo avisa SÓLO con el proveedor real', () => {
    const bucle = { API_URL_PUBLICA: 'http://127.0.0.1:3000' };
    expect(avisoDeUrlPublica({ PROVEEDOR_DE_EQUIPOS: REAL, ...bucle })).toMatch(/ningún teléfono/);
    expect(avisoDeUrlPublica({ PROVEEDOR_DE_EQUIPOS: 'simulado', ...bucle })).toBeNull();
    expect(
      avisoDeUrlPublica({ PROVEEDOR_DE_EQUIPOS: REAL, API_URL_PUBLICA: 'http://192.0.2.10:3000' }),
    ).toBeNull();
    expect(avisoDeUrlPublica({ PROVEEDOR_DE_EQUIPOS: REAL })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { TOPE_SIN_COMPRIMIR_MB, juzgar } from '../../../scripts/lib/imagen-de-la-api.mjs';

/**
 * D-154 · los juicios de `imagen-de-la-api.mjs` sobre la imagen ya construida.
 * La medición (docker) la ejerce el trabajo `imagen-de-la-api` de la CI; aquí
 * se prueba que cada violación se NOMBRA, y que la imagen buena no tiene
 * ninguna. Un control que nadie ha visto fallar no está demostrado (§2.8.0).
 */
const BUENA = {
  nodeDeLaImagen: 'v22.23.4',
  nvmrc: '22.23.4',
  usuario: 'node',
  prohibidos: [],
  sinComprimirMb: 230,
  codigoEscribible: false,
};

describe('D-154 · la imagen de la API', () => {
  it('la imagen buena pasa sin un solo motivo', () => {
    expect(juzgar(BUENA)).toEqual([]);
  });

  it('otro Node que el de .nvmrc', () => {
    expect(juzgar({ ...BUENA, nodeDeLaImagen: 'v22.22.2' })).toEqual([
      'la imagen trae Node v22.22.2, y .nvmrc dice v22.23.4',
    ]);
  });

  it.each(['', 'root', '0', '0:0'])('el proceso como root (USER «%s»)', (usuario) => {
    expect(juzgar({ ...BUENA, usuario })).toEqual([
      `el proceso corre como root (USER «${usuario}»)`,
    ]);
  });

  it('un .env, una llave o una credencial dentro, uno por uno', () => {
    expect(juzgar({ ...BUENA, prohibidos: ['/app/apps/api/.env', '/app/llave.pem'] })).toEqual([
      'la imagen trae /app/apps/api/.env',
      'la imagen trae /app/llave.pem',
    ]);
  });

  it('el código reescribible por el usuario del proceso', () => {
    expect(juzgar({ ...BUENA, codigoEscribible: true })).toEqual([
      'el usuario del proceso puede reescribir el código de la API',
    ]);
  });

  it('el tope de tamaño es estricto: 250 MB ya no pasa', () => {
    expect(juzgar({ ...BUENA, sinComprimirMb: TOPE_SIN_COMPRIMIR_MB - 1 })).toEqual([]);
    expect(juzgar({ ...BUENA, sinComprimirMb: TOPE_SIN_COMPRIMIR_MB })).toEqual([
      'pesa 250 MB sin comprimir (tope 250)',
    ]);
  });
});

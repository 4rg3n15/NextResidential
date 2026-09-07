import { describe, expect, it } from 'vitest';
import { consumirCodigoDeRecuperacion, generarCodigosDeRecuperacion } from './mfa';

describe('códigos de recuperación', () => {
  it('genera la cantidad pedida, únicos y con formato legible', () => {
    const { codigosEnClaro, almacenables } = generarCodigosDeRecuperacion(10);
    expect(codigosEnClaro).toHaveLength(10);
    expect(new Set(codigosEnClaro).size).toBe(10);
    expect(codigosEnClaro.every((c) => /^[0-9A-F]{5}-[0-9A-F]{5}$/.test(c))).toBe(true);
    // Solo se almacena el hash: el código en claro no debe poder recuperarse.
    expect(almacenables.every((a, i) => !a.hash.includes(codigosEnClaro[i]!))).toBe(true);
  });

  it('un código vale UNA vez', () => {
    const { codigosEnClaro, almacenables } = generarCodigosDeRecuperacion(3);
    expect(consumirCodigoDeRecuperacion(almacenables, codigosEnClaro[0]!)).toBe(true);
    expect(consumirCodigoDeRecuperacion(almacenables, codigosEnClaro[0]!)).toBe(false);
  });

  it('rechaza un código inexistente sin consumir ninguno', () => {
    const { almacenables } = generarCodigosDeRecuperacion(3);
    expect(consumirCodigoDeRecuperacion(almacenables, 'ABCDE-12345')).toBe(false);
    expect(almacenables.filter((a) => !a.usado)).toHaveLength(3);
  });

  it('no distingue mayúsculas ni espacios sobrantes', () => {
    const { codigosEnClaro, almacenables } = generarCodigosDeRecuperacion(1);
    expect(
      consumirCodigoDeRecuperacion(almacenables, ` ${codigosEnClaro[0]!.toLowerCase()} `),
    ).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import {
  combinar,
  encadenar,
  esExito,
  esFallo,
  exito,
  fallo,
  mapear,
  mapearError,
  plegar,
} from './resultado';

describe('Resultado', () => {
  it('distingue éxito de fallo', () => {
    expect(esExito(exito(1))).toBe(true);
    expect(esFallo(fallo('e'))).toBe(true);
    expect(esExito(fallo('e'))).toBe(false);
    expect(esFallo(exito(1))).toBe(false);
  });

  it('mapear transforma el valor y no toca el fallo', () => {
    expect(mapear(exito(2), (n: number) => n * 3)).toEqual(exito(6));
    expect(mapear(fallo<string>('x'), (n: number) => n * 3)).toEqual(fallo('x'));
  });

  it('encadenar corta en el primer fallo', () => {
    const doble = (n: number) => exito(n * 2);
    expect(encadenar(exito(2), doble)).toEqual(exito(4));
    expect(encadenar(fallo<string>('x'), doble)).toEqual(fallo('x'));
  });

  it('mapearError transforma solo el error', () => {
    expect(mapearError(fallo('x'), (e) => `${e}!`)).toEqual(fallo('x!'));
    expect(mapearError(exito(1), (e: string) => `${e}!`)).toEqual(exito(1));
  });

  it('plegar obliga a resolver las dos ramas', () => {
    expect(
      plegar(
        exito(5),
        (v) => `ok:${v}`,
        (e: string) => `err:${e}`,
      ),
    ).toBe('ok:5');
    expect(
      plegar(
        fallo('z'),
        (v: number) => `ok:${v}`,
        (e) => `err:${e}`,
      ),
    ).toBe('err:z');
  });

  it('combinar devuelve el primer fallo o todos los valores', () => {
    expect(combinar([exito(1), exito(2)])).toEqual(exito([1, 2]));
    expect(combinar([exito(1), fallo('mal'), exito(3)])).toEqual(fallo('mal'));
    expect(combinar<number, string>([])).toEqual(exito([]));
  });
});

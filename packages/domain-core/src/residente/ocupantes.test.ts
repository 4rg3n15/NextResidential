import { describe, expect, it } from 'vitest';
import {
  ALFABETO_DE_CODIGO,
  OCUPANTES_MAXIMO,
  PLAZAS_POR_DEFECTO,
  avisoDeOcupantes,
  codigoDesdeBytes,
  decidirDeclaracion,
  decidirNuevaPlaza,
  esMotivoDePermiso,
  explicacionDelTope,
  formatearCodigoDeOcupante,
  normalizarCodigoDeOcupante,
} from './ocupantes';

describe('plazas del titular (D-W10, D4 bis)', () => {
  it('el tope por omisión es 4, contando al titular (S-15W-03)', () => {
    expect(PLAZAS_POR_DEFECTO).toBe(4);
  });
  it('3 de 4: cabe una más, y quedan 4', () => {
    expect(decidirNuevaPlaza({ activas: 3, tope: 4 })).toEqual({ ok: true, valor: 4 });
  });
  it('4 de 4: la quinta no cabe', () => {
    expect(decidirNuevaPlaza({ activas: 4, tope: 4 })).toEqual({
      ok: false,
      error: 'TOPE_ALCANZADO',
    });
  });
  it('con tope propio de 6, la quinta y la sexta caben; la séptima no', () => {
    expect(decidirNuevaPlaza({ activas: 4, tope: 6 })).toEqual({ ok: true, valor: 5 });
    expect(decidirNuevaPlaza({ activas: 5, tope: 6 })).toEqual({ ok: true, valor: 6 });
    expect(decidirNuevaPlaza({ activas: 6, tope: 6 }).ok).toBe(false);
  });
  it('ningún tope supera la cota absoluta de la plataforma', () => {
    expect(decidirNuevaPlaza({ activas: OCUPANTES_MAXIMO, tope: 50 }).ok).toBe(false);
  });
  it('el tope se explica con su número y a quién pedir más', () => {
    expect(explicacionDelTope(4)).toBe(
      'Su vivienda tiene el máximo de 4 plazas. Para más, pídalo a la administración.',
    );
  });
});

describe('declaración inicial de ocupantes (D6, ya no definitiva)', () => {
  const base = { numero: 3, esPrimerResidente: true, yaDeclarada: false, tope: 4 };
  it('el titular declara de 1 hasta el tope', () => {
    expect(decidirDeclaracion(base)).toEqual({ ok: true, valor: 3 });
    expect(decidirDeclaracion({ ...base, numero: 4 })).toEqual({ ok: true, valor: 4 });
    expect(decidirDeclaracion({ ...base, numero: 1 })).toEqual({ ok: true, valor: 1 });
  });
  it('por encima del tope, no; con tope propio, sí', () => {
    expect(decidirDeclaracion({ ...base, numero: 5 })).toEqual({
      ok: false,
      error: 'SUPERA_EL_TOPE',
    });
    expect(decidirDeclaracion({ ...base, numero: 5, tope: 6 })).toEqual({ ok: true, valor: 5 });
  });
  it('permiso antes que forma: declarada, o de otro, no se explica el número', () => {
    expect(decidirDeclaracion({ ...base, yaDeclarada: true, numero: 99 })).toEqual({
      ok: false,
      error: 'YA_DECLARADA',
    });
    expect(decidirDeclaracion({ ...base, esPrimerResidente: false, numero: 99 })).toEqual({
      ok: false,
      error: 'NO_ES_PRIMER_RESIDENTE',
    });
    expect(esMotivoDePermiso('YA_DECLARADA')).toBe(true);
    expect(esMotivoDePermiso('NO_ES_PRIMER_RESIDENTE')).toBe(true);
    expect(esMotivoDePermiso('SUPERA_EL_TOPE')).toBe(false);
  });
  it('el número va de 1 a 20 y es entero', () => {
    for (const n of [0, OCUPANTES_MAXIMO + 1, 2.5]) {
      expect(decidirDeclaracion({ ...base, numero: n, tope: 50 })).toEqual({
        ok: false,
        error: 'NUMERO_INVALIDO',
      });
    }
    expect(esMotivoDePermiso('NUMERO_INVALIDO')).toBe(false);
  });
  it('el aviso ya no dice DEFINITIVO: dice el tope y a quién pedir más', () => {
    const aviso = avisoDeOcupantes(4);
    expect(aviso).not.toContain('DEFINITIVO');
    expect(aviso).toContain('hasta 4 en total');
    expect(aviso).toContain('administración');
  });
});

describe('el código de invitación (ADR-025, D2)', () => {
  it('ocho símbolos del alfabeto sin confundibles, estable por bytes', () => {
    const c = codigoDesdeBytes(new Uint8Array([1, 2, 3, 4, 5, 6]));
    expect(c).toHaveLength(8);
    expect([...c].every((x) => ALFABETO_DE_CODIGO.includes(x))).toBe(true);
    expect(codigoDesdeBytes(new Uint8Array([1, 2, 3, 4, 5]))).toBe(c);
    expect(codigoDesdeBytes(new Uint8Array([0, 0, 0, 0, 0]))).toBe('AAAAAAAA');
    expect(codigoDesdeBytes(new Uint8Array([255, 255, 255, 255, 255]))).toBe('99999999');
    expect(codigoDesdeBytes(new Uint8Array([]))).toBe('AAAAAAAA');
  });
  it('se muestra con el prefijo del conjunto: MIRA-K7PQ-2XWZ', () => {
    expect(formatearCodigoDeOcupante('K7PQ2XWZ', 'MIRA')).toBe('MIRA-K7PQ-2XWZ');
    expect(formatearCodigoDeOcupante('K7PQ2XWZ', null)).toBe('K7PQ-2XWZ');
  });
  it('se acepta con o sin prefijo, con guiones y espacios opcionales', () => {
    const esperado = { ok: true, valor: { prefijo: 'MIRA', codigo: 'K7PQ2XWZ' } };
    expect(normalizarCodigoDeOcupante('MIRA-K7PQ-2XWZ')).toEqual(esperado);
    expect(normalizarCodigoDeOcupante(' mira k7pq2xwz ')).toEqual(esperado);
    expect(normalizarCodigoDeOcupante('MIRAK7PQ2XWZ')).toEqual(esperado);
    expect(normalizarCodigoDeOcupante('k7pq-2xwz')).toEqual({
      ok: true,
      valor: { prefijo: null, codigo: 'K7PQ2XWZ' },
    });
  });
  it('lo imposible se rechaza: corto, símbolo fuera del alfabeto, prefijo de 1 o 2', () => {
    expect(normalizarCodigoDeOcupante('ABC').ok).toBe(false);
    expect(normalizarCodigoDeOcupante('ABCDEFG0').ok).toBe(false);
    expect(normalizarCodigoDeOcupante('MI-K7PQ-2XWZ').ok).toBe(false);
    expect(normalizarCodigoDeOcupante('MIRA!-K7PQ-2XWZ').ok).toBe(false);
    expect(normalizarCodigoDeOcupante('ABCDEFGHI-K7PQ-2XWZ').ok).toBe(false);
  });
});

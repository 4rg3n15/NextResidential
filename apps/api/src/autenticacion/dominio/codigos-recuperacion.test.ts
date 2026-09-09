import { describe, expect, it } from 'vitest';
import {
  CANTIDAD_DE_CODIGOS,
  casarCodigo,
  generarCodigosDeRecuperacion,
  hashDeCodigo,
  normalizarCodigo,
} from './codigos-recuperacion';

describe('generarCodigosDeRecuperacion', () => {
  it('genera diez códigos distintos con la forma acordada', () => {
    const { codigos } = generarCodigosDeRecuperacion();
    expect(codigos).toHaveLength(CANTIDAD_DE_CODIGOS);
    expect(new Set(codigos).size).toBe(CANTIDAD_DE_CODIGOS);
    for (const c of codigos) expect(c).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
  });

  it('dos llamadas no producen los mismos códigos', () => {
    const a = generarCodigosDeRecuperacion();
    const b = generarCodigosDeRecuperacion();
    expect(a.codigos.some((c) => b.codigos.includes(c))).toBe(false);
  });

  it('el hash NO permite recuperar el código', () => {
    // No se puede demostrar la irreversibilidad, pero sí que lo persistido no
    // contiene el código: es el error que convierte la tabla en un llavero.
    const { codigos, hashes } = generarCodigosDeRecuperacion();
    for (let i = 0; i < codigos.length; i += 1) {
      expect(hashes[i]).not.toContain(codigos[i]!.replace('-', ''));
      expect(hashes[i]).not.toContain(codigos[i]!);
    }
  });
});

describe('normalización', () => {
  it('acepta el código como lo escribe una persona', () => {
    // Minúsculas y espacios sobrantes son lo normal al copiarlo de un papel.
    expect(normalizarCodigo('  a1b2c-d3e4f ')).toBe('A1B2C-D3E4F');
    expect(hashDeCodigo('a1b2c-d3e4f')).toBe(hashDeCodigo('A1B2C-D3E4F'));
  });
});

describe('casarCodigo', () => {
  it('encuentra el hash del código correcto', () => {
    const { codigos, hashes } = generarCodigosDeRecuperacion();
    expect(casarCodigo(codigos[3]!, hashes)).toBe(hashes[3]);
  });

  it('devuelve null ante un código que no está', () => {
    const { hashes } = generarCodigosDeRecuperacion();
    expect(casarCodigo('00000-00000', hashes)).toBeNull();
  });

  it('un código ya consumido —fuera de la lista— deja de valer', () => {
    // «Un solo uso» se sostiene aquí: el consumido no se pasa como vigente.
    const { codigos, hashes } = generarCodigosDeRecuperacion();
    const vigentes = hashes.filter((h) => h !== hashes[0]);
    expect(casarCodigo(codigos[0]!, vigentes)).toBeNull();
    expect(casarCodigo(codigos[1]!, vigentes)).toBe(hashes[1]);
  });

  it('sin códigos vigentes no casa nada, y no revienta', () => {
    expect(casarCodigo('ABCDE-12345', [])).toBeNull();
  });

  it('no acepta un hash como si fuera el código', () => {
    // Quien lea la tabla no debe poder usar lo que ve.
    const { hashes } = generarCodigosDeRecuperacion();
    expect(casarCodigo(hashes[0]!, hashes)).toBeNull();
  });
});

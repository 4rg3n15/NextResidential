import { describe, expect, it } from 'vitest';
import {
  type HechosParaAutorizar,
  type MotivoDeNoAutorizar,
  explicacionDe,
  puedeAutorizar,
} from './puede-autorizar';

/** Todo en regla: cada prueba estropea UN hecho y comprueba qué gana. */
const enRegla: HechosParaAutorizar = {
  visitanteVetado: false,
  viviendaActiva: true,
  vinculoPuedeAutorizar: true,
  placaYaActiva: false,
};

describe('puedeAutorizar · cada regla, por separado', () => {
  it('con todo en regla, autoriza', () => {
    expect(puedeAutorizar(enRegla)).toEqual({ puede: true });
  });

  it('RN-06 · un visitante vetado no se puede autorizar', () => {
    expect(puedeAutorizar({ ...enRegla, visitanteVetado: true })).toEqual({
      puede: false,
      motivo: 'LISTA_NEGRA',
    });
  });

  it('RN-13 · una vivienda inactiva no genera autorizaciones nuevas', () => {
    expect(puedeAutorizar({ ...enRegla, viviendaActiva: false })).toEqual({
      puede: false,
      motivo: 'VIVIENDA_INACTIVA',
    });
  });

  it('P-11 · un vínculo sin nivel para autorizar tampoco', () => {
    expect(puedeAutorizar({ ...enRegla, vinculoPuedeAutorizar: false })).toEqual({
      puede: false,
      motivo: 'SIN_NIVEL_DE_ACCESO',
    });
  });

  it('RN-04 · CA-03 · una placa ya activa en el conjunto se rechaza', () => {
    expect(puedeAutorizar({ ...enRegla, placaYaActiva: true })).toEqual({
      puede: false,
      motivo: 'PLACA_DUPLICADA',
    });
  });
});

describe('puedeAutorizar · LA PRECEDENCIA, que es la parte que se rompe sola', () => {
  /**
   * Estas cuatro pruebas existen porque el orden de los `if` es la regla. Sin
   * ellas, reordenar las líneas —algo que hace cualquier refactor— cambiaría en
   * silencio el motivo que lee el residente, y ningún otro control lo notaría:
   * las cuatro reglas siguen «funcionando», solo que gana otra.
   */
  it('RN-06 gana a la vivienda inactiva: el problema no es la administración', () => {
    expect(puedeAutorizar({ ...enRegla, visitanteVetado: true, viviendaActiva: false })).toEqual({
      puede: false,
      motivo: 'LISTA_NEGRA',
    });
  });

  it('RN-06 gana al nivel de acceso', () => {
    expect(
      puedeAutorizar({ ...enRegla, visitanteVetado: true, vinculoPuedeAutorizar: false }),
    ).toEqual({ puede: false, motivo: 'LISTA_NEGRA' });
  });

  it('RN-06 gana a la placa duplicada', () => {
    expect(puedeAutorizar({ ...enRegla, visitanteVetado: true, placaYaActiva: true })).toEqual({
      puede: false,
      motivo: 'LISTA_NEGRA',
    });
  });

  it('con los cuatro problemas a la vez, sigue ganando la lista negra', () => {
    expect(
      puedeAutorizar({
        visitanteVetado: true,
        viviendaActiva: false,
        vinculoPuedeAutorizar: false,
        placaYaActiva: true,
      }),
    ).toEqual({ puede: false, motivo: 'LISTA_NEGRA' });
  });

  it('la vivienda inactiva gana al nivel y a la placa', () => {
    expect(
      puedeAutorizar({
        ...enRegla,
        viviendaActiva: false,
        vinculoPuedeAutorizar: false,
        placaYaActiva: true,
      }),
    ).toEqual({ puede: false, motivo: 'VIVIENDA_INACTIVA' });
  });
});

describe('explicacionDe · el residente entiende por qué, sin saber de quién', () => {
  const todos: readonly MotivoDeNoAutorizar[] = [
    'LISTA_NEGRA',
    'VIVIENDA_INACTIVA',
    'SIN_NIVEL_DE_ACCESO',
    'PLACA_DUPLICADA',
  ];

  it('los cuatro motivos tienen explicación, y ninguna es el código', () => {
    for (const m of todos) {
      const texto = explicacionDe(m);
      expect(texto.length).toBeGreaterThan(30);
      expect(texto).not.toContain(m);
    }
  });

  it('ninguna explicación filtra datos del vecino ni de quién vetó', () => {
    // Es una comprobación de privacidad, no de estilo: «ya está registrada en
    // la casa 12» le diría al residente algo de su vecino, que es justo el eje
    // de aislamiento que esta etapa introdujo.
    for (const m of todos) {
      expect(explicacionDe(m)).not.toMatch(/vivienda \d|casa \d|apartamento \d|vetó|registró/i);
    }
  });
});

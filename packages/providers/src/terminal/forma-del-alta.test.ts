import { describe, expect, it } from 'vitest';
import {
  PROPOSITO_CARGA_POST,
  PROPOSITO_CARGA_SETUP,
  listaDeclarada,
  propositoDeLaCarga,
  tipoDePersonaConVigencia,
} from './forma-del-alta';

describe('E3 (15-M) · el alta de un rostro se decide por lo que el equipo declara', () => {
  it('lee las listas `@opt` como las dan estos equipos', () => {
    expect(listaDeclarada({ '@opt': 'post, delete,put,get' })).toEqual([
      'post',
      'delete',
      'put',
      'get',
    ]);
    expect(listaDeclarada('normal')).toEqual(['normal']);
    expect(listaDeclarada({ '@opt': '' })).toBeUndefined();
    expect(listaDeclarada(undefined)).toBeUndefined();
    expect(listaDeclarada({ '@min': 1 })).toBeUndefined();
    expect(listaDeclarada(3)).toBeUndefined();
  });

  it('tipo de persona: visitor si lo admite o no lo dijo; normal si la lista no lo trae', () => {
    expect(tipoDePersonaConVigencia({})).toBe('visitor');
    expect(tipoDePersonaConVigencia({ tiposDePersona: ['normal', 'Visitor'] })).toBe('visitor');
    // El DS-KD9633 del 29/09: sólo `normal`.
    expect(tipoDePersonaConVigencia({ tiposDePersona: ['normal'] })).toBe('normal');
  });

  it('operación de la carga: setUp por omisión; post sin setUp; ninguna → null', () => {
    expect(propositoDeLaCarga({})).toBe(PROPOSITO_CARGA_SETUP);
    expect(propositoDeLaCarga({ operacionesDeBiblioteca: ['post', 'setUp'] })).toBe(
      PROPOSITO_CARGA_SETUP,
    );
    expect(propositoDeLaCarga({ operacionesDeBiblioteca: ['post', 'delete', 'put', 'get'] })).toBe(
      PROPOSITO_CARGA_POST,
    );
    expect(propositoDeLaCarga({ operacionesDeBiblioteca: ['get', 'delete'] })).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  ArbolDeSalidasDemasiadoHondo,
  PROFUNDIDAD_MAXIMA_DE_SALIDAS,
  aplanarSalidas,
  recorrerSalidas,
} from './salidas';
import type { NodoDeSalidas } from './salidas';

/**
 * 15-P · P5 · R3: la única recursión de la ronda, con su caso base y su
 * profundidad máxima. Lo que se prueba es que el tope NO recorta en silencio.
 */
const nodo = (
  clave: string,
  tipo: NodoDeSalidas['tipo'],
  hijos: readonly NodoDeSalidas[] = [],
  numeroDePuerta: number | null = null,
): NodoDeSalidas => ({
  clave,
  tipo,
  nombre: clave,
  numeroDePuerta,
  estado: null,
  nota: null,
  hijos,
});

describe('aplanarSalidas · equipo → módulo → salida', () => {
  it('devuelve las salidas en orden, con su ruta y su módulo', () => {
    const arbol = nodo('equipo', 'equipo', [
      nodo('propio', 'modulo', [
        nodo('puerta-1', 'salida', [], 1),
        nodo('puerta-2', 'salida', [], 2),
      ]),
      nodo('submodulo-7', 'modulo'),
    ]);
    expect(aplanarSalidas(arbol)).toEqual([
      { ruta: 'equipo/propio/puerta-1', nombre: 'puerta-1', numeroDePuerta: 1, modulo: 'propio' },
      { ruta: 'equipo/propio/puerta-2', nombre: 'puerta-2', numeroDePuerta: 2, modulo: 'propio' },
    ]);
  });

  it('caso base: una salida sin número no se puede abrir y no aparece', () => {
    expect(aplanarSalidas(nodo('equipo', 'equipo', [nodo('x', 'salida')]))).toEqual([]);
  });

  it('una hoja que no es salida (módulo vacío) no aporta nada', () => {
    expect(aplanarSalidas(nodo('equipo', 'equipo', [nodo('m', 'modulo')]))).toEqual([]);
  });

  it(`la profundidad máxima es ${String(PROFUNDIDAD_MAXIMA_DE_SALIDAS)}: un nivel más es ERROR, no recorte`, () => {
    const hondo = nodo('equipo', 'equipo', [
      nodo('propio', 'modulo', [nodo('sub', 'modulo', [nodo('puerta-9', 'salida', [], 9)])]),
    ]);
    expect(() => aplanarSalidas(hondo)).toThrow(ArbolDeSalidasDemasiadoHondo);
    expect(() => aplanarSalidas(hondo)).toThrow(/equipo\/propio\/sub\/puerta-9/);
  });

  it('un árbol cíclico construido a mano se detiene en el tope en vez de colgar', () => {
    const hijos: NodoDeSalidas[] = [];
    const ciclico: NodoDeSalidas = { ...nodo('equipo', 'equipo'), hijos };
    hijos.push(ciclico);
    expect(() => aplanarSalidas(ciclico)).toThrow(ArbolDeSalidasDemasiadoHondo);
  });

  it('recorrerSalidas: preorden con nivel, ruta y padre; una salida es hoja', () => {
    const arbol = nodo('equipo', 'equipo', [
      nodo('propio', 'modulo', [nodo('puerta-1', 'salida', [nodo('colgado', 'salida', [], 9)], 1)]),
    ]);
    expect(recorrerSalidas(arbol).map((n) => [n.ruta, n.nivel, n.padre])).toEqual([
      ['equipo', 1, null],
      ['equipo/propio', 2, 'equipo'],
      ['equipo/propio/puerta-1', 3, 'equipo/propio'],
    ]);
  });
});

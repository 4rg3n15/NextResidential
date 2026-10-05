import { describe, expect, it } from 'vitest';
import { EquipoInalcanzable } from '@ncr/providers';
import type { NodoDeSalidas } from '@ncr/providers';
import { LectorDeSalidasPorProveedor } from './lector-de-salidas-por-proveedor';

/** 15-P · P5 · la traducción del proveedor al puerto, incluida la R3. */
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

describe('LectorDeSalidasPorProveedor', () => {
  it('leída: el árbol y sus salidas abribles', async () => {
    const arbol = nodo('equipo', 'equipo', [
      nodo('propio', 'modulo', [nodo('puerta-2', 'salida', [], 2)]),
    ]);
    const r = await new LectorDeSalidasPorProveedor({ salidasDe: async () => arbol }).leer('vp');
    expect(r).toEqual({
      estado: 'leida',
      arbol,
      salidas: [
        { ruta: 'equipo/propio/puerta-2', nombre: 'puerta-2', numeroDePuerta: 2, modulo: 'propio' },
      ],
    });
  });

  it('R3 · más de tres niveles: inválida, con la ruta del exceso', async () => {
    const hondo = nodo('equipo', 'equipo', [
      nodo('propio', 'modulo', [nodo('sub', 'modulo', [nodo('puerta-9', 'salida', [], 9)])]),
    ]);
    const r = await new LectorDeSalidasPorProveedor({ salidasDe: async () => hondo }).leer('vp');
    expect(r.estado).toBe('invalida');
    expect(r.estado === 'invalida' && r.motivo).toMatch(/equipo\/propio\/sub/);
  });

  it('el equipo no contesta: sin lectura, con un motivo sin dirección ni clave', async () => {
    const r = await new LectorDeSalidasPorProveedor({
      salidasDe: async () => {
        // DT-15S1-03 · antes con TRES argumentos para dos: el mensaje era 'vp', no
        // llevaba la dirección, y la aserción de abajo no podía fallar.
        throw new EquipoInalcanzable('connect ECONNREFUSED portero.invalid:80', 3000);
      },
    }).leer('vp');
    expect(r.estado).toBe('sin_lectura');
    expect(r.estado === 'sin_lectura' && r.motivo).not.toMatch(/portero\.invalid|ECONNREFUSED/);
  });

  it('un proveedor que no lee salidas lo dice', async () => {
    const r = await new LectorDeSalidasPorProveedor({}).leer('vp');
    expect(r).toEqual({ estado: 'sin_lectura', motivo: 'El proveedor de equipos no lee salidas' });
  });
});

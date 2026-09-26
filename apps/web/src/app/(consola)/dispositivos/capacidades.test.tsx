import { describe, expect, it } from 'vitest';
import type { Equipo } from '@ncr/contracts';
import { resumenDeCapacidades } from './pantalla';

/**
 * H-SITIO-09 · el videoportero puede tener biblioteca de rostros. La fila debe
 * decir si recibe plantillas o si NO APLICA —que no es «sin comprobar»: eso se
 * resuelve sondeando; lo otro, no—.
 */
const videoportero = (biblioteca: 'si' | 'no' | 'desconocida'): Equipo =>
  ({
    tipo: 'intercom',
    capacidades: {
      origen: 'sondeo',
      aperturaRemota: 'si',
      verificacionRemota: 'desconocida',
      bibliotecaDeRostros: { estado: biblioteca, maximo: null, almacenadas: null },
      gestionDePersonas: 'desconocida',
      audioBidireccional: { estado: 'si', canal: 1 },
      senalizacionDeLlamada: 'si',
      suscripcionDeEventos: 'si',
      reconocimientoDePlacas: 'no',
      estadoDeBarrera: 'no',
    },
  }) as unknown as Equipo;

describe('H-SITIO-09 · el videoportero dice si recibe rostros', () => {
  it.each([
    ['si', 'Rostros: recibe plantillas'],
    ['no', 'Rostros: no aplica'],
    ['desconocida', 'Rostros sin comprobar'],
  ] as const)('%s → «%s»', (estado, texto) => {
    expect(resumenDeCapacidades(videoportero(estado)).map((x) => x.texto)).toContain(texto);
  });
});

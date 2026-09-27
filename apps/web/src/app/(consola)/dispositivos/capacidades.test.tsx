import { describe, expect, it } from 'vitest';
import type { Equipo } from '@ncr/contracts';
import { resumenDeCapacidades } from './pantalla';

/**
 * H-SITIO-09 · el videoportero puede tener biblioteca de rostros. La fila debe
 * decir si recibe plantillas o si NO APLICA —que no es «sin comprobar»: eso se
 * resuelve sondeando; lo otro, no—.
 */
const videoportero = (
  biblioteca: 'si' | 'no' | 'desconocida',
  video: { estado: string; codec: string | null; canal: string | null } = {
    estado: 'desconocida',
    codec: null,
    canal: null,
  },
): Equipo =>
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
      video,
    },
  }) as unknown as Equipo;

describe('H-SITIO-09 · el videoportero dice si recibe rostros', () => {
  it.each([
    ['si', 'Rostros: recibe plantillas'],
    ['no', 'Este equipo no admite rostros'],
    ['desconocida', 'Rostros sin comprobar'],
  ] as const)('%s → «%s»', (estado, texto) => {
    expect(resumenDeCapacidades(videoportero(estado)).map((x) => x.texto)).toContain(texto);
  });
});

describe('D2 (15-L) · la fila dice el video que describió el equipo', () => {
  it.each([
    [{ estado: 'si', codec: 'H.264', canal: '102' }, 'Video H.264 (102)'],
    [{ estado: 'si', codec: 'H.265', canal: '101' }, 'Video H.265 (101): no se ve en el navegador'],
    [{ estado: 'no', codec: null, canal: '202' }, 'Sin video en el canal (202)'],
    [{ estado: 'desconocida', codec: null, canal: null }, 'Video sin comprobar'],
  ])('%o → «%s»', (video, texto) => {
    expect(resumenDeCapacidades(videoportero('si', video)).map((x) => x.texto)).toContain(texto);
  });
});

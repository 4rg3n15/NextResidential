import { describe, expect, it } from 'vitest';
import { canalPropuesto, elegirCanalDeVideo, fraseDeEleccion } from './canal-de-video';

const CAMARA = [{ id: '101', codec: 'H.264' }];
const TERMINAL = [
  { id: '101', codec: 'H.265' },
  { id: '102', codec: 'H.264' },
];

describe('V2 (15-N) · el canal de video sale de lo que el equipo declara', () => {
  it('la cámara del 29/09: ficha con 102, el equipo sólo declara 101 → 101, diciendo por qué', () => {
    const e = elegirCanalDeVideo('102', CAMARA);
    expect(e).toEqual({ canal: '101', origen: 'propuesto', sustituido: '102' });
    expect(fraseDeEleccion(e)).toMatch(/el 102 de la ficha no existe en el equipo/);
  });

  it('sin canal en la ficha: el subflujo declarado; sin subflujo, el primero', () => {
    expect(elegirCanalDeVideo(null, TERMINAL).canal).toBe('102');
    expect(elegirCanalDeVideo(undefined, CAMARA).canal).toBe('101');
    expect(canalPropuesto([{ id: '201', codec: null }])).toBe('201');
  });

  it('la ficha manda si el equipo declara su canal', () => {
    expect(elegirCanalDeVideo('101', TERMINAL)).toEqual({
      canal: '101',
      origen: 'ficha',
      sustituido: null,
    });
  });

  it('nunca 102 fijo: sin ficha y sin lista, no hay canal', () => {
    expect(elegirCanalDeVideo(null, undefined)).toEqual({
      canal: null,
      origen: 'sin_canal',
      sustituido: null,
    });
    expect(elegirCanalDeVideo('', [])).toMatchObject({ canal: null });
  });

  it('un equipo que no lista sus canales conserva el de la ficha', () => {
    expect(elegirCanalDeVideo('301', undefined).canal).toBe('301');
  });
});

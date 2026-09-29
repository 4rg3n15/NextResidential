import { describe, expect, it } from 'vitest';
import {
  PREGUNTA_DE_CANALES_DE_VIDEO,
  canalDeVideoPorOmision,
  canalesDeVideoDesde,
  codecNormalizado,
  descubrirCanalesDeVideo,
} from './canales-de-video';
import type { RespuestaDeCapacidad } from './rostros-y-personas';
import { capacidadesDesdeJson } from '../nucleo/capacidades';

/**
 * E2/C1 (15-M) · lo que la cámara del 28/09 no decía: qué canales tiene.
 */
const XML =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<StreamingChannelList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">' +
  '<StreamingChannel><id>101</id><channelName>Camera 01</channelName><enabled>true</enabled>' +
  '<Transport><rtspPortNo>554</rtspPortNo></Transport>' +
  '<Video><enabled>true</enabled><videoCodecType>H.265</videoCodecType></Video></StreamingChannel>' +
  '<StreamingChannel><id>102</id><channelName>Camera 01</channelName><enabled>true</enabled>' +
  '<Video><enabled>true</enabled><videoCodecType>H.264</videoCodecType></Video></StreamingChannel>' +
  '<StreamingChannel><id>103</id><enabled>false</enabled>' +
  '<Video><videoCodecType>MJPEG</videoCodecType></Video></StreamingChannel>' +
  '<StreamingChannel><id>abc</id><enabled>true</enabled></StreamingChannel>' +
  '</StreamingChannelList>';

describe('canalesDeVideoDesde · el StreamingChannelList, en canales con códec', () => {
  it('lista los habilitados con id de canal×100+flujo, en el orden del equipo', () => {
    expect(canalesDeVideoDesde(XML)).toEqual([
      { id: '101', codec: 'H.265' },
      { id: '102', codec: 'H.264' },
    ]);
  });

  it('sin canales, lista vacía; sin códec, null', () => {
    expect(canalesDeVideoDesde('<StreamingChannelList/>')).toEqual([]);
    expect(canalesDeVideoDesde('<StreamingChannel><id>201</id></StreamingChannel>')).toEqual([
      { id: '201', codec: null },
    ]);
  });

  it('el códec se normaliza como el del SDP', () => {
    expect(codecNormalizado('h264')).toBe('H.264');
    expect(codecNormalizado('H.264+')).toBe('H.264');
    expect(codecNormalizado('HEVC')).toBe('H.265');
    expect(codecNormalizado('JPEG')).toBe('MJPEG');
    expect(codecNormalizado('')).toBeNull();
    expect(codecNormalizado('SVAC')).toBe('SVAC');
  });

  it('por omisión el subflujo (x02) si existe; si no, el primero; sin canales, null', () => {
    expect(canalDeVideoPorOmision([{ id: '101' }, { id: '102' }])).toBe('102');
    expect(canalDeVideoPorOmision([{ id: '101' }, { id: '201' }])).toBe('101');
    expect(canalDeVideoPorOmision([])).toBeNull();
  });
});

describe('descubrirCanalesDeVideo · con la misma consulta que rostros y personas', () => {
  const consulta =
    (r: RespuestaDeCapacidad) =>
    async (proposito: string): Promise<RespuestaDeCapacidad> => {
      expect(proposito).toBe(PREGUNTA_DE_CANALES_DE_VIDEO);
      return r;
    };

  it('con cuerpo, los canales y sin motivo', async () => {
    const r = await descubrirCanalesDeVideo(
      consulta({ cuerpo: XML, noAdmite: false, motivo: null }),
    );
    expect(r.canales.map((c) => c.id)).toEqual(['101', '102']);
    expect(r.motivo).toBeNull();
  });

  it('«no admite» y «no se pudo leer» vuelven vacíos con su motivo, sin lanzar', async () => {
    const no = await descubrirCanalesDeVideo(
      consulta({ cuerpo: null, noAdmite: true, motivo: 'HTTP 404' }),
    );
    expect(no).toEqual({ canales: [], motivo: 'el equipo no lista sus canales de video' });
    const roto = await descubrirCanalesDeVideo(
      consulta({ cuerpo: null, noAdmite: false, motivo: 'el equipo contestó HTTP 500' }),
    );
    expect(roto).toEqual({ canales: [], motivo: 'el equipo contestó HTTP 500' });
  });
});

describe('capacidadesDesdeJson · los canales guardados vuelven, y lo viejo sigue leyéndose', () => {
  it('con canales', () => {
    const c = capacidadesDesdeJson({
      video: {
        estado: 'si',
        codec: 'H.264',
        canal: '102',
        canales: [{ id: '101', codec: 'H.265' }, { id: '102', codec: null }, { id: 7 }, 'x'],
      },
    });
    expect(c.video).toEqual({
      estado: 'si',
      codec: 'H.264',
      canal: '102',
      canales: [
        { id: '101', codec: 'H.265' },
        { id: '102', codec: null },
      ],
    });
  });

  it('sin canales (guardado antes de la 15-M) no aparece el campo', () => {
    const c = capacidadesDesdeJson({ video: { estado: 'si', codec: 'H.264', canal: '102' } });
    expect('canales' in c.video).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  REMEDIOS_DE_VIDEO,
  codecsDeLaOferta,
  decidirViaDeVideo,
  fraseDeVideoNoReproducible,
} from './via-de-video';
import { OFERTA_SDP_DE_NAVEGADOR } from '../simulacion/oferta-de-navegador';
import { OFERTA_SDP_DE_SONDA, OFERTA_SDP_DE_SONDA_CON_H265 } from '../ensayo/oferta-sdp-de-sonda';

/**
 * A2 (15-S2) · la tabla de la decisión, fila por fila: (códec del equipo ×
 * códecs de la oferta × transcodificación) → vía.
 */
const H264 = new Set(['H.264']);
const AMBOS = new Set(['H.264', 'H.265']);
const NINGUNO = new Set<string>();

describe('codecsDeLaOferta', () => {
  it('Chrome (la oferta capturada) trae H.264 y no H.265', () => {
    expect([...codecsDeLaOferta(OFERTA_SDP_DE_NAVEGADOR)]).toEqual(['H.264']);
  });

  it('la sonda con H.265 —la forma de Safari— trae los dos; HEVC también cuenta', () => {
    expect(codecsDeLaOferta(OFERTA_SDP_DE_SONDA_CON_H265)).toEqual(AMBOS);
    expect(codecsDeLaOferta('m=video 9 X 98\r\na=rtpmap:98 HEVC/90000\r\n')).toEqual(
      new Set(['H.265']),
    );
  });

  it('sólo mira la sección de video: un H264 en el audio no cuenta', () => {
    const sdp =
      'v=0\r\nm=audio 9 X 0\r\na=rtpmap:0 H264/90000\r\nm=video 9 X 96\r\na=rtpmap:96 VP8/90000\r\n';
    expect(codecsDeLaOferta(sdp)).toEqual(NINGUNO);
    expect(codecsDeLaOferta(OFERTA_SDP_DE_SONDA)).toEqual(H264);
  });
});

describe('decidirViaDeVideo', () => {
  it.each([
    // códec,   oferta,  transcodifica, vía
    [null, H264, false, 'directo'],
    [null, NINGUNO, false, 'directo'],
    ['H.264', H264, false, 'directo'],
    ['H.265', AMBOS, false, 'directo'],
    ['H.265', AMBOS, true, 'directo'],
    ['H.265', H264, true, 'transcodificado'],
    ['H.265', H264, false, 'no_reproducible'],
    ['H.265', NINGUNO, true, 'no_reproducible'],
    ['H.264', NINGUNO, true, 'no_reproducible'],
  ] as const)('%s × %j × %s → %s', (codec, oferta, transcodifica, via) => {
    expect(decidirViaDeVideo(codec, oferta, transcodifica).via).toBe(via);
  });

  it('los motivos dicen por qué: sin transcodificación, o sin H.264 en el navegador', () => {
    expect(decidirViaDeVideo('H.265', H264, false)).toEqual({
      via: 'no_reproducible',
      motivo:
        'este navegador no reproduce H.265 y el puente no transcodifica ' +
        '(VIDEO_TRANSCODIFICAR=nunca, sin ffmpeg o video servido por el Edge)',
    });
    expect(decidirViaDeVideo('H.265', NINGUNO, true)).toMatchObject({
      motivo: 'el navegador no acepta H.265 ni H.264, y el puente sólo transcodifica a H.264',
    });
  });

  it('la frase lleva el códec, el canal y los TRES remedios', () => {
    const frase = fraseDeVideoNoReproducible('H.265', '101', 'motivo');
    expect(frase).toBe(`entrega H.265 en el canal 101: motivo. ${REMEDIOS_DE_VIDEO}`);
    expect(REMEDIOS_DE_VIDEO).toMatch(/\(1\) abra la consola en Safari/);
    expect(REMEDIOS_DE_VIDEO).toMatch(/\(2\) instale ffmpeg .*`brew install ffmpeg`/);
    expect(REMEDIOS_DE_VIDEO).toMatch(/\(3\) cambie ese flujo a H\.264 .*autorización del cliente/);
    expect(fraseDeVideoNoReproducible('H.265', null, 'm')).toBe(
      `entrega H.265: m. ${REMEDIOS_DE_VIDEO}`,
    );
  });
});

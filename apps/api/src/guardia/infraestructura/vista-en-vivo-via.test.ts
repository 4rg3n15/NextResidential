import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import type { OrigenDeVideo, ProveedorDeEquipos } from '@ncr/providers';
import { OFERTA_SDP_DE_NAVEGADOR } from '@ncr/providers';
import { NegociarVistaEnVivo } from '../aplicacion/vista-en-vivo';
import type { PoliticaDeTranscodificacion, PuenteDeVideo } from '../aplicacion/puertos';
import { PuenteDeVideoFallo, SinOrigenDeVideo } from '../aplicacion/puertos';
import { vistaEnVivoPorCopropiedad } from './puente-de-video-por-el-edge';
import { REGLA_DE_VIDEO } from './regla-de-video';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A2–A4 (15-S2) · LA VÍA DEL VIDEO EN LA API
 *
 * Un equipo en H.265: con la oferta de Safari, directo; con la de Chrome,
 * transcodificado por el puente bajo otro nombre; sin transcodificación (o con
 * el puente del Edge), «no reproducible» con los tres remedios y SIN tocar el
 * puente cuando ya se sabe de antemano.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const DISPOSITIVO = 'e0000000-0000-4000-8000-000000000265';
const CLAVE = 'clave-del-equipo';
const H265: OrigenDeVideo = {
  rtsp: `rtsp://servicio:${CLAVE}@equipo.local:554/Streaming/Channels/101`,
  flujo: 'principal',
  detalle: 'flujo 101',
  codec: 'H.265',
  canal: '101',
};
const CHROME = OFERTA_SDP_DE_NAVEGADOR;
const SAFARI = CHROME.replace(/^(m=video 9 UDP\/TLS\/RTP\/SAVPF [0-9 ]+)$/m, '$1 125').replace(
  /^(a=mid:0\r\n)/m,
  '$1a=rtpmap:125 H265/90000\r\n',
);
const RESPUESTA = 'v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 108\r\na=rtpmap:108 H264/90000\r\n';

type Transcodificar = ((nombre: string) => Promise<string | null>) | undefined;

const banco = (
  transcodificar: Transcodificar,
  politica: PoliticaDeTranscodificacion = 'auto',
  origen: OrigenDeVideo = H265,
) => {
  const llamadas: string[] = [];
  const anotaciones: unknown[] = [];
  const puente: PuenteDeVideo = {
    asegurarFlujo: async (nombre, fuente) => {
      llamadas.push(`asegurar ${nombre} ${fuente.startsWith('rtsp://') ? 'rtsp' : fuente}`);
    },
    negociar: async (nombre) => {
      llamadas.push(`negociar ${nombre}`);
      return RESPUESTA;
    },
    ...(transcodificar === undefined
      ? {}
      : {
          asegurarTranscodificado: async (nombre: string) => {
            llamadas.push(`transcodificar ${nombre}`);
            return transcodificar(nombre);
          },
        }),
  };
  const proveedor = { origenDeVideo: async () => origen } as unknown as ProveedorDeEquipos;
  const bitacora = {
    registrar: (_n: string, _m: string, datos?: unknown) => anotaciones.push(datos),
  } as unknown as Bitacora;
  const reloj = { ahora: () => new Date(0) };
  const caso = new NegociarVistaEnVivo(
    proveedor,
    puente,
    bitacora,
    reloj,
    politica,
    REGLA_DE_VIDEO,
  );
  const pedir = (ofertaSdp: string) =>
    caso.ejecutar({ copropiedadId: 'c', dispositivoId: DISPOSITIVO, operadorId: 'o', ofertaSdp });
  return { pedir, llamadas, anotaciones };
};

const NOMBRE = `ncr-${DISPOSITIVO}`;
const derivado = async (nombre: string) => `${nombre}-h264`;

describe('NegociarVistaEnVivo · la vía (A2–A4, 15-S2)', () => {
  it('H.265 con la oferta de Safari: directo, sin transcodificar', async () => {
    const b = banco(derivado);
    const r = await b.pedir(SAFARI);
    expect(r.via).toBe('directo');
    expect(b.llamadas).toEqual([`asegurar ${NOMBRE} rtsp`, `negociar ${NOMBRE}`]);
  });

  it('H.265 con la oferta de Chrome: el flujo derivado, y se anota la vía y el códec', async () => {
    const b = banco(derivado);
    const r = await b.pedir(CHROME);
    expect(r.via).toBe('transcodificado');
    expect(b.llamadas).toEqual([
      `asegurar ${NOMBRE} rtsp`,
      `transcodificar ${NOMBRE}`,
      `negociar ${NOMBRE}-h264`,
    ]);
    expect(b.anotaciones).toContainEqual(
      expect.objectContaining({ via: 'transcodificado', codec: 'H.265' }),
    );
  });

  it('VIDEO_TRANSCODIFICAR=nunca: no reproducible con los tres remedios, y el puente ni se toca', async () => {
    const b = banco(derivado, 'nunca');
    const error = await b.pedir(CHROME).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SinOrigenDeVideo);
    expect((error as Error).message).toMatch(
      /entrega H\.265 en el canal 101: este navegador no reproduce H\.265 .*\(1\) abra la consola en Safari.*\(2\) instale ffmpeg.*\(3\) cambie ese flujo a H\.264/,
    );
    expect((error as Error).message).not.toContain(CLAVE);
    expect(b.llamadas).toEqual([]);
  });

  it('un puente sin transcodificación: lo mismo', async () => {
    const b = banco(undefined);
    await expect(b.pedir(CHROME)).rejects.toBeInstanceOf(SinOrigenDeVideo);
    expect(b.llamadas).toEqual([]);
  });

  it('el puente del Edge no puede con ese flujo (null): no reproducible y no se negocia', async () => {
    const b = banco(async () => null);
    const error = await b.pedir(CHROME).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SinOrigenDeVideo);
    expect((error as Error).message).toMatch(/el puente no transcodifica/);
    expect(b.llamadas).toEqual([`asegurar ${NOMBRE} rtsp`, `transcodificar ${NOMBRE}`]);
  });

  it('un navegador sin H.264 ni H.265: no reproducible aunque haya transcodificación', async () => {
    const b = banco(derivado);
    const sinH264 = CHROME.replace(/^a=rtpmap:108 H264\/90000\r\n/m, '');
    const error = await b.pedir(sinH264).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/no acepta H\.265 ni H\.264/);
    expect(b.llamadas).toEqual([]);
  });

  it('el fallo del puente al transcodificar (sin ffmpeg) sale en palabras, con brew install', async () => {
    const b = banco(async () => {
      throw new PuenteDeVideoFallo(
        'negociación WebRTC con el puente: HTTP 500 · streams: exec: "ffmpeg": executable file not found in $PATH',
      );
    });
    const error = await b.pedir(CHROME).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PuenteDeVideoFallo);
    expect((error as Error).message).toMatch(/necesita ffmpeg .*`brew install ffmpeg`/);
  });

  it('la fábrica de la API entrega la regla: con «nunca», no reproducible sin tocar el puente', async () => {
    const llamadas: string[] = [];
    const puente: PuenteDeVideo = {
      asegurarFlujo: async (n) => void llamadas.push(n),
      negociar: async () => RESPUESTA,
    };
    const proveedor = { origenDeVideo: async () => H265 } as unknown as ProveedorDeEquipos;
    const bitacora = { registrar: () => undefined } as unknown as Bitacora;
    const caso = vistaEnVivoPorCopropiedad(
      proveedor,
      puente,
      bitacora,
      { ahora: () => new Date(0) },
      null,
      'nunca',
    );
    const error = await caso
      .ejecutar({
        copropiedadId: 'c',
        dispositivoId: DISPOSITIVO,
        operadorId: 'o',
        ofertaSdp: CHROME,
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SinOrigenDeVideo);
    expect(llamadas).toEqual([]);
  });

  it('códec desconocido (equipo que no lo declara): directo, como hasta ahora', async () => {
    const b = banco(derivado, 'auto', { ...H265, codec: null });
    expect((await b.pedir(CHROME)).via).toBe('directo');
  });
});

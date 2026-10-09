import { describe, expect, it } from 'vitest';
import { pasoDeVideoWebrtc } from './paso-de-video-webrtc';
import { resultado } from './tipos';
import type { OpcionesDeEnsayo } from './tipos';

/**
 * A2/A5 (15-S2) · el paso 7 con la MISMA regla que la API: un equipo en H.265
 * se sirve transcodificado a la oferta de la sonda (la de Chrome), se mide el
 * PRIMER CUADRO —no sólo la SDP— y se prueba también la vía de Safari.
 */
const CLAVE = 'clave-que-no-debe-salir';
const opciones = (fetchFn: typeof fetch, transcodificar?: string): OpcionesDeEnsayo =>
  ({
    equipo: {
      familia: 'camara',
      host: '192.0.2.41',
      puerto: 80,
      usuario: 'servicio',
      clave: CLAVE,
      puerta: 1,
      canalDeVideo: '101',
      puertoRtsp: 554,
    },
    puente: {
      url: 'http://127.0.0.1:1984',
      fetchFn,
      ...(transcodificar === undefined ? {} : { transcodificar }),
    },
    interlocutor: { indicar: async () => undefined, confirmar: async () => null },
    soloLectura: true,
    esperaDeEventoMs: 0,
    limitesDeFoto: { bytesMaximos: 1, ladoMaximo: 1 },
    zona: 'America/Bogota',
    ahora: () => new Date(0),
  }) as unknown as OpcionesDeEnsayo;

const SONDA = resultado('video', 'ok', 'H.265 por RTSP (canal 101, puerto RTSP 554)');

const mp4 = (retrasoMs: number) =>
  new Response(
    new ReadableStream({
      async start(c) {
        c.enqueue(new TextEncoder().encode('....ftyp....moov'));
        await new Promise((listo) => setTimeout(listo, retrasoMs));
        // «mdat» partido en dos trozos: también se encuentra.
        c.enqueue(new TextEncoder().encode('....md'));
        c.enqueue(new TextEncoder().encode('at....'));
        c.close();
      },
    }),
  );

const puente = (retrasoMs = 0, sdpMs = 0) => {
  const llamadas: { metodo: string; url: URL; cuerpo: string }[] = [];
  const fetchFn: typeof fetch = async (entrada, init) => {
    const url = new URL(String(entrada));
    const metodo = init?.method ?? 'GET';
    llamadas.push({ metodo, url, cuerpo: typeof init?.body === 'string' ? init.body : '' });
    if (metodo === 'GET') return mp4(retrasoMs);
    if (metodo === 'POST') {
      await new Promise((listo) => setTimeout(listo, sdpMs));
      return new Response('v=0\r\nm=video 9 X 96\r\n', { status: 201 });
    }
    return new Response('', { status: 200 });
  };
  return { fetchFn, llamadas };
};

const texto = (p: Awaited<ReturnType<typeof pasoDeVideoWebrtc>>): string =>
  [p.causa, p.accion ?? '', ...p.detalle].join('\n');

describe('pasoDeVideoWebrtc · la vía (A2/A5, 15-S2)', () => {
  it('H.265: transcodificado para Chrome, con el primer cuadro medido, y Safari directo', async () => {
    const { fetchFn, llamadas } = puente();
    const p = await pasoDeVideoWebrtc(opciones(fetchFn), SONDA, '101', 'H.265');
    expect(p.estado).toBe('ok');
    expect(p.causa).toMatch(
      /en \d+ ms \(transcodificado\), primer cuadro a los \d+ ms de pedirlo \(SDP \d+ \+ \d+\)$/,
    );
    const registros = llamadas.filter((l) => l.metodo === 'PATCH');
    expect(registros.map((l) => l.url.searchParams.get('name'))).toEqual([
      'ensayo-camara',
      'ensayo-camara-h264',
    ]);
    expect(registros[1]?.url.searchParams.get('src')).toBe('ffmpeg:ensayo-camara#video=h264');
    const posts = llamadas.filter((l) => l.metodo === 'POST');
    expect(posts.map((l) => l.url.searchParams.get('src'))).toEqual([
      'ensayo-camara-h264',
      'ensayo-camara',
    ]);
    expect(posts[1]?.cuerpo).toMatch(/a=rtpmap:97 H265\/90000/);
    expect(llamadas.find((l) => l.metodo === 'GET')?.url.pathname).toBe('/api/stream.mp4');
    expect(p.detalle.join('\n')).toMatch(/Safari \(oferta con H\.265\) · directo, SDP en \d+ ms/);
    expect(llamadas.filter((l) => l.metodo === 'DELETE')).toHaveLength(2);
    expect(texto(p)).not.toContain(CLAVE);
  });

  it('un primer cuadro de más de 2 s se dice SOBRE la meta de KPI-33', async () => {
    const { fetchFn } = puente(2100);
    const p = await pasoDeVideoWebrtc(opciones(fetchFn), SONDA, '101', 'H.265');
    expect(p.causa).toMatch(
      /primer cuadro a los \d+ ms de pedirlo .*, SOBRE la meta de 2 s de KPI-33/,
    );
  });

  it('lo que cuenta es el TOTAL: 1,5 s de SDP y 0,6 s de cuadro ya pasan de 2 s', async () => {
    const { fetchFn } = puente(600, 1500);
    const p = await pasoDeVideoWebrtc(opciones(fetchFn), SONDA, '101', 'H.265');
    expect(p.causa).toMatch(/SOBRE la meta de 2 s de KPI-33/);
  }, 10_000);

  it('H.265 con VIDEO_TRANSCODIFICAR=nunca: FALLO con los tres remedios, sin tocar el puente', async () => {
    const { fetchFn, llamadas } = puente();
    const p = await pasoDeVideoWebrtc(opciones(fetchFn, 'nunca'), SONDA, '101', 'H.265');
    expect(p.estado).toBe('fallo');
    expect(p.accion).toMatch(/\(1\) abra la consola en Safari.*\(2\) instale ffmpeg.*\(3\)/);
    expect(llamadas).toEqual([]);
  });

  it('el puente sin ffmpeg: FALLO que dice brew install ffmpeg', async () => {
    const fetchFn: typeof fetch = async (_e, init) =>
      init?.method === 'POST'
        ? new Response('streams: exec: "ffmpeg": executable file not found in $PATH', {
            status: 500,
          })
        : new Response('', { status: 200 });
    const p = await pasoDeVideoWebrtc(opciones(fetchFn), SONDA, '101', 'H.265');
    expect(p.estado).toBe('fallo');
    expect(p.causa).toMatch(/no encuentra ffmpeg .*brew install ffmpeg/);
  });
});

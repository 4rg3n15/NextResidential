import { describe, expect, it } from 'vitest';
import { pasoDeVideoWebrtc } from './paso-de-video-webrtc';
import { resultado } from './tipos';
import type { OpcionesDeEnsayo } from './tipos';

/**
 * E2/C1 (15-M) · el paso 7 negocia WebRTC contra el puente si hay GO2RTC_URL,
 * y NUNCA deja ver la credencial del equipo.
 */
const CLAVE = 'clave-que-no-debe-salir';

const opciones = (fetchFn: typeof fetch | undefined, conPuente = true): OpcionesDeEnsayo =>
  ({
    equipo: {
      familia: 'terminal',
      host: '192.0.2.40',
      puerto: 80,
      usuario: 'servicio',
      clave: CLAVE,
      puerta: 1,
      canalDeVideo: '102',
      puertoRtsp: 554,
    },
    ...(conPuente
      ? { puente: { url: 'http://127.0.0.1:1984/', ...(fetchFn ? { fetchFn } : {}) } }
      : {}),
    interlocutor: { indicar: async () => undefined, confirmar: async () => null },
    soloLectura: true,
    esperaDeEventoMs: 0,
    limitesDeFoto: { bytesMaximos: 1, ladoMaximo: 1 },
    zona: 'America/Bogota',
    ahora: () => new Date(0),
  }) as unknown as OpcionesDeEnsayo;

const SONDA_OK = resultado('video', 'ok', 'H.264 por RTSP (canal 102, puerto RTSP 554)');

const puente = (respuestas: Record<string, () => Response>) => {
  const llamadas: { url: string; metodo: string }[] = [];
  const fetchFn: typeof fetch = async (entrada, init) => {
    const url = String(entrada);
    const metodo = init?.method ?? 'GET';
    llamadas.push({ url, metodo });
    const r = respuestas[metodo];
    if (r === undefined) throw new Error(`sin respuesta para ${metodo}`);
    return r();
  };
  return { fetchFn, llamadas };
};

const todoElTexto = (p: Awaited<ReturnType<typeof pasoDeVideoWebrtc>>): string =>
  [p.causa, p.accion ?? '', ...p.detalle].join('\n');

describe('pasoDeVideoWebrtc', () => {
  it('sin GO2RTC_URL deja la sonda como está y lo dice', async () => {
    const p = await pasoDeVideoWebrtc(opciones(undefined, false), SONDA_OK);
    expect(p.estado).toBe('ok');
    expect(p.detalle).toContain('WebRTC no probado: sin GO2RTC_URL en apps/api/.env');
  });

  it('si la sonda RTSP ya falló, no se negocia', async () => {
    const { fetchFn, llamadas } = puente({});
    const p = await pasoDeVideoWebrtc(
      opciones(fetchFn),
      resultado('video', 'fallo', 'El equipo no tiene ese flujo', 'otro canal'),
    );
    expect(p.estado).toBe('fallo');
    expect(llamadas).toEqual([]);
    expect(p.detalle).toContain('WebRTC no probado: la sonda RTSP ya falló');
  });

  it('PATCH con la fuente (#backchannel=0) y POST /api/webrtc con SDP: OK con los ms, sin la clave', async () => {
    const { fetchFn, llamadas } = puente({
      PATCH: () => new Response('', { status: 200 }),
      POST: () => new Response('v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n', { status: 201 }),
      DELETE: () => new Response('', { status: 200 }),
    });
    const p = await pasoDeVideoWebrtc(opciones(fetchFn), SONDA_OK);
    expect(p.estado).toBe('ok');
    expect(p.causa).toMatch(/H\.264 por RTSP .*; WebRTC negociado con el puente en \d+ ms/);
    const registro = llamadas.find((l) => l.metodo === 'PATCH');
    const src = new URL(registro?.url ?? '').searchParams.get('src') ?? '';
    expect(src).toMatch(
      /^rtsp:\/\/servicio:.*@192\.0\.2\.40:554\/Streaming\/Channels\/102#backchannel=0$/,
    );
    expect(llamadas.map((l) => l.metodo)).toEqual(['PATCH', 'POST', 'DELETE']);
    expect(todoElTexto(p)).not.toContain(CLAVE);
    expect(todoElTexto(p)).not.toMatch(/rtsp:\/\//);
  });

  it('«HTTP 500 · EOF» del puente es FALLO con la causa en palabras y sin la fuente', async () => {
    const { fetchFn } = puente({
      PATCH: () => new Response('', { status: 200 }),
      POST: () =>
        new Response(`streams: EOF rtsp://servicio:${CLAVE}@192.0.2.40:554/x`, { status: 500 }),
      DELETE: () => new Response('', { status: 200 }),
    });
    const p = await pasoDeVideoWebrtc(opciones(fetchFn), SONDA_OK);
    expect(p.estado).toBe('fallo');
    expect(p.causa).toMatch(/cerró la conexión de video \(backchannel/);
    expect(p.accion).toMatch(/otro canal en la ficha/);
    expect(todoElTexto(p)).toContain('HTTP 500');
    expect(todoElTexto(p)).not.toContain(CLAVE);
  });

  it('un registro rechazado por el YAML (400) y un puente apagado se dicen con remedio', async () => {
    const yaml = puente({
      PATCH: () => new Response('yaml: line 9: did not find expected key', { status: 400 }),
    });
    const p1 = await pasoDeVideoWebrtc(opciones(yaml.fetchFn), SONDA_OK);
    expect(p1.estado).toBe('fallo');
    expect(p1.causa).toMatch(/streams:` sobrante/);

    const apagado: typeof fetch = async () => {
      throw new Error('fetch failed: ECONNREFUSED 127.0.0.1:1984');
    };
    const p2 = await pasoDeVideoWebrtc(opciones(apagado), SONDA_OK);
    expect(p2.estado).toBe('fallo');
    expect(p2.causa).toMatch(/no contesta en GO2RTC_URL/);
    expect(p2.accion).toMatch(/pnpm sitio:video/);
  });
});

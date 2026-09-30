import { describe, expect, it } from 'vitest';
import { PuenteGo2rtc, conFinDeLinea, redactar } from './puente-go2rtc';
import { PuenteDeVideoFallo } from '../aplicacion/puertos';

const RTSP = 'rtsp://usuario:clave-secreta@equipo.local:554/Streaming/Channels/102';

const banco = (responder: (url: string, init: RequestInit) => Response) => {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const puente = new PuenteGo2rtc('http://puente.local:1984/', async (url, init) => {
    llamadas.push({ url, init });
    return responder(url, init);
  });
  return { puente, llamadas };
};

describe('PuenteGo2rtc (A5)', () => {
  it('registra el flujo con PATCH /api/streams?name&src (en memoria, nunca al YAML), con la fuente codificada', async () => {
    const { puente, llamadas } = banco(() => new Response('', { status: 200 }));
    await puente.asegurarFlujo('ncr-equipo-1', RTSP);
    expect(llamadas).toHaveLength(1);
    const [llamada] = llamadas;
    expect(llamada?.init.method).toBe('PATCH');
    const url = new URL(llamada?.url ?? '');
    expect(url.pathname).toBe('/api/streams');
    expect(url.searchParams.get('name')).toBe('ncr-equipo-1');
    expect(url.searchParams.get('src')).toBe(RTSP);
  });

  it('negocia con POST /api/webrtc?src como application/sdp y devuelve la respuesta', async () => {
    const { puente, llamadas } = banco(
      () =>
        new Response('v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\n', {
          status: 201,
          headers: { 'content-type': 'application/sdp' },
        }),
    );
    const sdp = await puente.negociar('ncr-equipo-1', 'v=0\r\noferta');
    expect(sdp.startsWith('v=0')).toBe(true);
    const [llamada] = llamadas;
    expect(llamada?.init.method).toBe('POST');
    expect(new URL(llamada?.url ?? '').searchParams.get('src')).toBe('ncr-equipo-1');
    expect((llamada?.init.headers as Record<string, string>)['content-type']).toBe(
      'application/sdp',
    );
    // V1 (15-N) · esta aserción fijaba el reenvío de una oferta SIN CRLF final,
    // que go2rtc rechaza con «EOF»: era el defecto. El puente la repone.
    expect(llamada?.init.body).toBe('v=0\r\noferta\r\n');
  });

  it('un HTTP no 2xx es PuenteDeVideoFallo con el código, y SIN la credencial', async () => {
    const { puente } = banco(() => new Response(`streams: bad source ${RTSP}`, { status: 400 }));
    const error = await puente.asegurarFlujo('n', RTSP).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PuenteDeVideoFallo);
    const mensaje = (error as Error).message;
    expect(mensaje).toContain('HTTP 400');
    expect(mensaje).not.toContain('clave-secreta');
    expect(mensaje).toContain('rtsp://[redactado]');
  });

  it('una respuesta que no es SDP también es fallo del puente', async () => {
    const { puente } = banco(() => new Response('<html>', { status: 200 }));
    await expect(puente.negociar('n', 'v=0')).rejects.toBeInstanceOf(PuenteDeVideoFallo);
  });

  it('un fallo de red no filtra la fuente aunque el error la nombre', async () => {
    const { puente } = banco(() => {
      throw new Error(`ECONNREFUSED al abrir ${RTSP}`);
    });
    const error = await puente.negociar('n', 'v=0').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PuenteDeVideoFallo);
    expect((error as Error).message).not.toContain('clave-secreta');
  });

  it('redactar quita cualquier rtsp:// o rtsps:// con lo que lleve detrás', () => {
    expect(redactar(`a ${RTSP} b rtsps://u:p@x/y c`)).toBe(
      'a rtsp://[redactado] b rtsp://[redactado] c',
    );
  });
});

describe('V1 (15-N) · la oferta sale hacia el puente con su CRLF final', () => {
  it('repone el CRLF que un cliente —o un intermediario— quitó, sin duplicarlo', () => {
    expect(conFinDeLinea('v=0\r\ns=-')).toBe('v=0\r\ns=-\r\n');
    expect(conFinDeLinea('v=0\r\ns=-\r\n')).toBe('v=0\r\ns=-\r\n');
    expect(conFinDeLinea('v=0\r\ns=-\n')).toBe('v=0\r\ns=-\r\n');
  });

  it('negociar envía al puente la oferta terminada en CRLF', async () => {
    let enviado = '';
    const puente = new PuenteGo2rtc('http://puente', async (_url, init) => {
      enviado = String(init.body);
      return new Response('v=0\r\n', { status: 201 });
    });
    await puente.negociar('ncr-x', 'v=0\r\ns=-');
    expect(enviado.endsWith('\r\n')).toBe(true);
  });
});

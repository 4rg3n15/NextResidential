import { describe, expect, it } from 'vitest';
import { Go2rtcLocal, limpiarRtsp } from './go2rtc-local';

/**
 * 15-Q2 · D4/E2 · el go2rtc local recibe la URL RTSP con su credencial y la
 * oferta del navegador. Nada de lo que conteste —ni sus errores— puede devolver
 * esa URL: se limpia antes de salir del Edge.
 */
const RTSP = 'rtsp://servicio:clave-de-prueba@198.51.100.7:554/Streaming/Channels/101';
const OFERTA = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-';
const RESPUESTA = 'v=0\r\no=- 2 2 IN IP4 127.0.0.1\r\ns=-\r\n';

interface Llamada {
  readonly url: URL;
  readonly init: RequestInit;
}

/** Un `fetch` falso que contesta en orden lo que se le da. */
const transporte = (...respuestas: (() => Promise<Response>)[]) => {
  const llamadas: Llamada[] = [];
  const peticion = (async (entrada: string | URL, init?: RequestInit): Promise<Response> => {
    llamadas.push({ url: new URL(String(entrada)), init: init ?? {} });
    const siguiente = respuestas.shift();
    if (siguiente === undefined) throw new Error('llamada no prevista');
    return siguiente();
  }) as typeof fetch;
  return { peticion, llamadas };
};

const ok =
  (cuerpo = '') =>
  async () =>
    new Response(cuerpo, { status: 200 });
const http = (status: number, cuerpo: string) => async () => new Response(cuerpo, { status });

describe('Go2rtcLocal · negociar', () => {
  it('registra el flujo (PATCH) y luego negocia la oferta (POST), y devuelve el SDP', async () => {
    const t = transporte(ok(), ok(RESPUESTA));
    const go2rtc = new Go2rtcLocal('http://127.0.0.1:1984//', t.peticion);
    expect(await go2rtc.negociar('camara-1', RTSP, OFERTA)).toBe(RESPUESTA);

    const [registro, negociacion] = t.llamadas;
    expect(registro?.init.method).toBe('PATCH');
    expect(registro?.url.origin + (registro?.url.pathname ?? '')).toBe(
      'http://127.0.0.1:1984/api/streams',
    );
    expect(registro?.url.searchParams.get('name')).toBe('camara-1');
    expect(registro?.url.searchParams.get('src')).toBe(RTSP);
    expect(registro?.init.signal).toBeInstanceOf(AbortSignal);

    expect(negociacion?.init.method).toBe('POST');
    expect(negociacion?.url.pathname).toBe('/api/webrtc');
    expect(negociacion?.url.searchParams.get('src')).toBe('camara-1');
    // El RTSP con la credencial NO va en la negociación: sólo el nombre del flujo.
    expect(String(negociacion?.url)).not.toContain('clave-de-prueba');
    expect(negociacion?.init.headers).toEqual({
      'content-type': 'application/sdp',
      accept: 'application/sdp',
    });
    expect(negociacion?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['sin fin de línea', 'v=0\r\ns=-', 'v=0\r\ns=-\r\n'],
    ['con LF final', 'v=0\r\ns=-\n', 'v=0\r\ns=-\r\n'],
    ['con varios saltos finales', 'v=0\r\ns=-\n\r\n\n', 'v=0\r\ns=-\r\n'],
    ['ya con CRLF', 'v=0\r\ns=-\r\n', 'v=0\r\ns=-\r\n'],
  ])('la oferta %s termina en CRLF', async (_caso, oferta, enviada) => {
    const t = transporte(ok(), ok(RESPUESTA));
    await new Go2rtcLocal('http://127.0.0.1:1984', t.peticion).negociar('f', RTSP, oferta);
    expect(t.llamadas[1]?.init.body).toBe(enviada);
  });

  it('una respuesta que no es SDP se rechaza', async () => {
    const t = transporte(ok(), ok('<html>panel</html>'));
    await expect(
      new Go2rtcLocal('http://127.0.0.1:1984', t.peticion).negociar('f', RTSP, OFERTA),
    ).rejects.toThrow('go2rtc local: la respuesta no es SDP');
  });
});

describe('Go2rtcLocal · los errores no se llevan la credencial', () => {
  it('un HTTP de error con el RTSP en el cuerpo sale limpio', async () => {
    const t = transporte(http(500, `streams: no se pudo abrir ${RTSP}: dial tcp`));
    const error = await new Go2rtcLocal('http://127.0.0.1:1984', t.peticion)
      .negociar('f', RTSP, OFERTA)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    const mensaje = (error as Error).message;
    expect(mensaje).toBe(
      'go2rtc local: HTTP 500 · streams: no se pudo abrir rtsp://[redactado] dial tcp',
    );
    expect(mensaje).not.toContain('clave-de-prueba');
    // La negociación no llega a intentarse.
    expect(t.llamadas).toHaveLength(1);
  });

  it('un HTTP de error sin cuerpo dice sólo el estado', async () => {
    const t = transporte(ok(), http(404, ''));
    await expect(
      new Go2rtcLocal('http://127.0.0.1:1984', t.peticion).negociar('f', RTSP, OFERTA),
    ).rejects.toThrow(/^go2rtc local: HTTP 404$/);
  });

  it('un cuerpo de error ilegible no tapa el estado', async () => {
    const roto = {
      ok: false,
      status: 502,
      text: () => Promise.reject(new Error('cuerpo cortado')),
    } as unknown as Response;
    const t = transporte(async () => roto);
    await expect(
      new Go2rtcLocal('http://127.0.0.1:1984', t.peticion).negociar('f', RTSP, OFERTA),
    ).rejects.toThrow(/^go2rtc local: HTTP 502$/);
  });

  it('el cuerpo del error se acota a 200 caracteres', async () => {
    const t = transporte(http(400, 'x'.repeat(500)));
    const error = (await new Go2rtcLocal('http://127.0.0.1:1984', t.peticion)
      .negociar('f', RTSP, OFERTA)
      .catch((e: unknown) => e)) as Error;
    expect(error.message).toBe(`go2rtc local: HTTP 400 · ${'x'.repeat(200)}`);
  });

  it.each([
    ['un Error', () => Promise.reject(new Error(`connect ECONNREFUSED ${RTSP}`))],
    ['algo que no es un Error', () => Promise.reject(`fallo de red con ${RTSP}`)],
  ])('un fallo de red (%s) sale limpio', async (_caso, fallo) => {
    const t = transporte(fallo);
    const error = (await new Go2rtcLocal('http://127.0.0.1:1984', t.peticion)
      .negociar('f', RTSP, OFERTA)
      .catch((e: unknown) => e)) as Error;
    expect(error.message).toMatch(/^go2rtc local: .*rtsp:\/\/\[redactado\]$/);
    expect(error.message).not.toContain('clave-de-prueba');
  });

  it('el plazo aborta la llamada que no contesta', async () => {
    const colgada = (async (_e: string | URL, init?: RequestInit) =>
      new Promise<Response>((_r, rechazar) => {
        init?.signal?.addEventListener('abort', () => rechazar(init.signal?.reason));
      })) as typeof fetch;
    await expect(
      new Go2rtcLocal('http://127.0.0.1:1984', colgada, 20).negociar('f', RTSP, OFERTA),
    ).rejects.toThrow(/^go2rtc local: .*(timeout|aborted)/i);
  });
});

describe('limpiarRtsp', () => {
  it('también la forma CODIFICADA, que es como viaja en la consulta del PATCH', () => {
    const consulta = 'name=x&src=rtsp%3A%2F%2Fservicio%3Aclave%40192.0.2.7%3A554%2Fs&y=1';
    expect(limpiarRtsp(consulta)).toBe('name=x&src=rtsp://[redactado]&y=1');
  });

  it('tacha rtsp y rtsps, sin importar mayúsculas, y se detiene en comillas y espacios', () => {
    expect(limpiarRtsp(`a ${RTSP} b "RTSPS://u:p@203.0.113.9/x" c 'rtsp://u:p@h' <rtsp://h>`)).toBe(
      'a rtsp://[redactado] b "rtsp://[redactado]" c \'rtsp://[redactado]\' <rtsp://[redactado]>',
    );
  });

  it('un texto sin URL RTSP no cambia', () => {
    expect(limpiarRtsp('http://127.0.0.1:1984/api/streams')).toBe(
      'http://127.0.0.1:1984/api/streams',
    );
  });
});

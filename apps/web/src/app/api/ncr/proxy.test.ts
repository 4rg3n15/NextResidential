import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
// Igual que arriba: la ruta se importa tras `resetModules` y el tipo, estático.
import type * as RutaProxy from './[...ruta]/route';

/**
 * Proxy BFF. Es la única pieza por la que pasa **todo** el tráfico autenticado
 * de la consola, así que lo que aquí se comprueba son garantías, no detalles.
 */
const ENTORNO = {
  API_URL: 'http://api.invalid',
  SUPABASE_URL: 'https://proyecto.invalid',
  // Valor con forma deliberadamente NO de llave: el escáner de secretos
  // marca el prefijo `sb_publishable_` aunque el valor sea inventado, y tiene
  // razón — un marcador que dispara el control enseña a ignorarlo.
  SUPABASE_PUBLISHABLE_KEY: 'llave-publicable-de-prueba',
  NODE_ENV: 'test',
};

const tokenFalso = { accessToken: 'token-vigente', expiraEn: 1_800_000_600 };
let token: { accessToken: string; expiraEn: number } | null = tokenFalso;

vi.mock('@/lib/sesion/token', () => ({
  tokenVigente: async () => token,
}));

let ruta: typeof RutaProxy;
let fetchFalso: ReturnType<typeof vi.fn>;

const peticion = (url: string, init: RequestInit = {}): NextRequest => {
  const r = new Request(url, init) as NextRequest;
  Object.defineProperty(r, 'nextUrl', { value: new URL(url) });
  return r;
};

const invocar = async (
  url: string,
  segmentos: string[],
  init: RequestInit = {},
): Promise<Response> =>
  ruta.GET(peticion(url, init), { params: Promise.resolve({ ruta: segmentos }) });

beforeEach(async () => {
  vi.resetModules();
  token = tokenFalso;
  for (const [k, v] of Object.entries(ENTORNO)) vi.stubEnv(k, v);
  fetchFalso = vi.fn(
    async () =>
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchFalso);
  ruta = await import('./[...ruta]/route');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('autenticación', () => {
  it('añade el token del servidor: el navegador nunca lo ve', async () => {
    await invocar('http://consola/api/ncr/copropiedades/abc/tablero/indicadores', [
      'copropiedades',
      'abc',
      'tablero',
      'indicadores',
    ]);
    const [, opciones] = fetchFalso.mock.calls[0] as [URL, RequestInit];
    expect(new Headers(opciones.headers).get('authorization')).toBe('Bearer token-vigente');
  });

  it('sin sesión responde 401 y NO llama a la API', async () => {
    token = null;
    const respuesta = await invocar('http://consola/api/ncr/copropiedades/abc', [
      'copropiedades',
      'abc',
    ]);
    expect(respuesta.status).toBe(401);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('una cabecera Authorization del cliente NO se reenvía', async () => {
    // Sin la lista blanca, el navegador podría inyectar su propio token y
    // suplantar la identidad que el servidor acaba de resolver.
    await invocar('http://consola/api/ncr/copropiedades/abc', ['copropiedades', 'abc'], {
      headers: { authorization: 'Bearer token-del-atacante', cookie: 'ncr_acceso=robada' },
    });
    const cabeceras = new Headers((fetchFalso.mock.calls[0] as [URL, RequestInit])[1].headers);
    expect(cabeceras.get('authorization')).toBe('Bearer token-vigente');
    expect(cabeceras.get('cookie')).toBeNull();
  });
});

describe('transporte', () => {
  it('conserva la ruta y los parámetros de consulta', async () => {
    await invocar(
      'http://consola/api/ncr/copropiedades/abc/eventos?desde=2026-09-09T00%3A00%3A00Z&tamanoPagina=20',
      ['copropiedades', 'abc', 'eventos'],
    );
    const [destino] = fetchFalso.mock.calls[0] as [URL];
    expect(destino.pathname).toBe('/copropiedades/abc/eventos');
    expect(destino.searchParams.get('desde')).toBe('2026-09-09T00:00:00Z');
    expect(destino.searchParams.get('tamanoPagina')).toBe('20');
  });

  it('devuelve el 404 de la API TAL CUAL, sin convertirlo en 403', async () => {
    // El backend responde 404 —y no 403— ante un recurso de otra copropiedad,
    // a propósito. Traducirlo aquí reintroduciría la fuga que evita.
    fetchFalso.mockResolvedValueOnce(new Response('{"estado":404}', { status: 404 }));
    const respuesta = await invocar('http://consola/api/ncr/copropiedades/otra', [
      'copropiedades',
      'otra',
    ]);
    expect(respuesta.status).toBe(404);
  });

  it('la API caída se distingue con 503, no con un 500 genérico', async () => {
    fetchFalso.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const respuesta = await invocar('http://consola/api/ncr/health', ['health']);
    expect(respuesta.status).toBe(503);
    expect(await respuesta.json()).toMatchObject({ estado: 503 });
  });

  it('nunca marca la respuesta como cacheable', async () => {
    // Una respuesta autenticada cacheada por un intermediario es una fuga
    // entre usuarios, y en este sistema también entre copropiedades.
    fetchFalso.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'cache-control': 'public, max-age=3600' } }),
    );
    const respuesta = await invocar('http://consola/api/ncr/health', ['health']);
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
  });

  it('no reenvía cabeceras internas de la API que no estén en la lista blanca', async () => {
    fetchFalso.mockResolvedValueOnce(
      new Response('{}', {
        status: 200,
        headers: { 'x-powered-by': 'Express', 'x-interno-traza': 'sql:select * from eventos' },
      }),
    );
    const respuesta = await invocar('http://consola/api/ncr/health', ['health']);
    expect(respuesta.headers.get('x-powered-by')).toBeNull();
    expect(respuesta.headers.get('x-interno-traza')).toBeNull();
  });

  it('sí reenvía las cabeceras que la consola necesita', async () => {
    fetchFalso.mockResolvedValueOnce(
      new Response('csv', {
        status: 200,
        headers: {
          'content-disposition': 'attachment; filename="eventos.csv"',
          'x-ncr-truncado': 'si',
          'retry-after': '30',
        },
      }),
    );
    const respuesta = await invocar('http://consola/api/ncr/x', ['x']);
    expect(respuesta.headers.get('content-disposition')).toContain('eventos.csv');
    expect(respuesta.headers.get('x-ncr-truncado')).toBe('si');
    expect(respuesta.headers.get('retry-after')).toBe('30');
  });

  it('el cuerpo se devuelve como flujo, para que el SSE siga siendo un flujo', async () => {
    // Si se bufferizara, `…/eventos/flujo` se convertiría en una petición que
    // no termina nunca y el canal en vivo dejaría de existir.
    const flujo = new ReadableStream({
      start(controlador) {
        controlador.enqueue(new TextEncoder().encode('event: listo\ndata: {}\n\n'));
        controlador.close();
      },
    });
    fetchFalso.mockResolvedValueOnce(
      new Response(flujo, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    const respuesta = await invocar('http://consola/api/ncr/x/flujo', ['x', 'flujo']);
    expect(respuesta.headers.get('content-type')).toBe('text/event-stream');
    expect(await respuesta.text()).toContain('event: listo');
  });

  it('un segmento con caracteres especiales se codifica y no escapa de la ruta', async () => {
    await invocar('http://consola/api/ncr/copropiedades/x', ['copropiedades', '..%2Fadmin']);
    const [destino] = fetchFalso.mock.calls[0] as [URL];
    expect(destino.pathname).not.toContain('/admin');
  });
});

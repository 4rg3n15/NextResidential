import { afterEach, describe, expect, it, vi } from 'vitest';
import { construirCsp } from '@/middleware-csp';
import { abrirCanal } from './sse/canal';
import { comoWebSocket, origenDirecto, urlDelAudio, urlDelFlujoDirecto } from './origen-directo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · D1/D2/D3 · EL NAVEGADOR CONTRA LA API, CON BILLETE, SÓLO SI SE DECLARA
 *
 * Sin `<meta name="ncr-api-origen">` (sitio) todo va como antes: el flujo por
 * `/api/ncr/…/flujo` con la cookie y el audio por `/api/ncr-audio` (D3). Con
 * ella (Netlify), el flujo y el audio van al origen de la API con un billete
 * pedido por el proxy, SIN credenciales del navegador, y la CSP sólo admite
 * ese origen (https y wss).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const COP = '10000000-0000-4000-8000-000000000001';
const API = 'https://api.ncr.example';
const RUTA = `/api/ncr/copropiedades/${COP}/eventos`;

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
});

describe('D1 · de dónde sale el origen', () => {
  it('sin meta, null (sitio); con meta válida, el origen; con basura, null', () => {
    expect(origenDirecto()).toBeNull();
    document.head.innerHTML = `<meta name="ncr-api-origen" content="${API}">`;
    expect(origenDirecto()).toBe(API);
    document.head.innerHTML = '<meta name="ncr-api-origen" content="javascript:alert(1)">';
    expect(origenDirecto()).toBeNull();
  });

  it('https → wss y http → ws', () => {
    expect(comoWebSocket(API)).toBe('wss://api.ncr.example');
    expect(comoWebSocket('http://localhost:3000')).toBe('ws://localhost:3000');
  });
});

describe('D1/D3 · la URL del audio', () => {
  const ubicacion = { protocol: 'https:', host: 'consola.ncr.example' };
  it('en sitio, por la consola (como en la 15-P)', () => {
    expect(urlDelAudio('b-1', null, ubicacion)).toBe(
      'wss://consola.ncr.example/api/ncr-audio?billete=b-1',
    );
  });
  it('en Netlify, directo a la API', () => {
    expect(urlDelAudio('b 1', API, ubicacion)).toBe(
      'wss://api.ncr.example/guardia/audio?billete=b%201',
    );
  });
});

describe('D1 · el flujo en vivo directo', () => {
  it('pide el billete POR EL PROXY y lo pega a la ruta de la API', async () => {
    const pedir = vi.fn(
      async () =>
        new Response(JSON.stringify({ billete: 'eventos.x', ruta: '/flujo-directo/eventos' }), {
          status: 201,
        }),
    );
    await expect(urlDelFlujoDirecto(RUTA, API, pedir as typeof fetch)).resolves.toBe(
      `${API}/flujo-directo/eventos?billete=eventos.x`,
    );
    expect(pedir).toHaveBeenCalledWith(
      `${RUTA}/billete`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sin billete (403, 401), no abre nada: falla y el canal reintenta', async () => {
    const pedir = vi.fn(async () => new Response('{}', { status: 403 }));
    await expect(urlDelFlujoDirecto(RUTA, API, pedir as typeof fetch)).rejects.toThrow(/403/);
  });

  it('el canal abre la fuente directa SIN credenciales y con un billete nuevo en cada intento', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/billete')
          ? new Response(
              JSON.stringify({ billete: `eventos.${String(++n)}`, ruta: '/flujo-directo/eventos' }),
            )
          : new Response('{}'),
      ),
    );
    const fuentes: {
      url: string;
      conCredenciales: boolean | undefined;
      f: { onerror: (() => void) | null };
    }[] = [];
    const baja = abrirCanal({
      copropiedadId: COP,
      origen: API,
      aleatorio: () => 0,
      mensajes: {
        estado: () => undefined,
        evento: () => undefined,
        alerta: () => undefined,
        recuperados: () => undefined,
      },
      crearFuente: (url, conCredenciales) => {
        const f = {
          onerror: null as (() => void) | null,
          addEventListener: () => undefined,
          close: () => undefined,
        };
        fuentes.push({ url, conCredenciales, f });
        return f as unknown as EventSource;
      },
    });
    await vi.waitFor(() => expect(fuentes).toHaveLength(1));
    expect(fuentes[0]).toMatchObject({
      url: `${API}/flujo-directo/eventos?billete=eventos.1`,
      conCredenciales: false,
    });
    fuentes[0]?.f.onerror?.();
    await vi.waitFor(() => expect(fuentes).toHaveLength(2), { timeout: 2_000 });
    expect(fuentes[1]?.url).toBe(`${API}/flujo-directo/eventos?billete=eventos.2`);
    baja();
  });

  it('en sitio, el canal sigue abriendo `…/flujo` por el proxy, con la cookie (D3)', () => {
    const urls: [string, boolean | undefined][] = [];
    const baja = abrirCanal({
      copropiedadId: COP,
      origen: null,
      mensajes: {
        estado: () => undefined,
        evento: () => undefined,
        alerta: () => undefined,
        recuperados: () => undefined,
      },
      crearFuente: (url, conCredenciales) => {
        urls.push([url, conCredenciales]);
        return {
          addEventListener: () => undefined,
          close: () => undefined,
        } as unknown as EventSource;
      },
    });
    expect(urls).toEqual([[`${RUTA}/flujo`, true]]);
    baja();
  });
});

describe('D2 · la CSP sólo admite la API pública', () => {
  it('connect-src: self, el origen https y su forma wss; nada más', () => {
    const politica = construirCsp({
      nonce: 'n',
      desarrollo: false,
      peticionSegura: true,
      origenApi: API,
      origenApiWebSocket: comoWebSocket(API),
    });
    const connect = politica.split('; ').find((d) => d.startsWith('connect-src '));
    expect(connect).toBe(`connect-src 'self' ${API} wss://api.ncr.example`);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type * as RutaProxy from './[...ruta]/route';
import { MAXIMO_CUERPO_DEL_PROXY } from '@/lib/cuerpo-acotado';

/**
 * D-149 · EL PROXY REENVÍA BYTES, NO UN FLUJO.
 *
 * Con Node 22.23.4, darle a `fetch` el `ReadableStream` de Next perdía a veces
 * el primer trozo y «Mi rostro» fallaba (`lib/cuerpo-acotado.ts`). Aquí se fija
 * lo que llega a `fetch`: los bytes enteros, sin `duplex`, y un 413 propio —sin
 * llamar a la API— cuando el cuerpo pasa del tope.
 */
let ruta: typeof RutaProxy;
let fetchFalso: ReturnType<typeof vi.fn>;

vi.mock('@/lib/sesion/token', () => ({
  tokenVigente: async () => ({ accessToken: 'token-vigente', expiraEn: 1_800_000_600 }),
}));

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv('API_URL', 'http://api.invalid');
  vi.stubEnv('SUPABASE_URL', 'https://proyecto.invalid');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'llave-publicable-de-prueba');
  vi.stubEnv('NODE_ENV', 'test');
  fetchFalso = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchFalso);
  ruta = await import('./[...ruta]/route');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const peticion = (cuerpo: BodyInit, cabeceras: Record<string, string> = {}): NextRequest => {
  const p = new Request('http://consola/api/ncr/copropiedades/c/mi/rostro', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...cabeceras },
    body: cuerpo,
    duplex: 'half',
  } as RequestInit) as NextRequest;
  Object.defineProperty(p, 'nextUrl', { value: new URL(p.url) });
  return p;
};
const contexto = { params: Promise.resolve({ ruta: ['copropiedades', 'c', 'mi', 'rostro'] }) };

describe('D-149 · el cuerpo que el proxy entrega a fetch', () => {
  it('son los bytes enteros, empezando por el primero, y no un flujo con duplex', async () => {
    const json = JSON.stringify({ contenidoBase64: `/9j/${'t6mTjFAusl'.repeat(5000)}` });
    // Llega en trozos, como desde el navegador: el primero es el que se perdía.
    const trozos = [json.slice(0, 24), json.slice(24, 30_000), json.slice(30_000)];
    const enTrozos = new ReadableStream<Uint8Array>({
      pull(ctl) {
        const t = trozos.shift();
        if (t === undefined) ctl.close();
        else ctl.enqueue(new TextEncoder().encode(t));
      },
    });

    const r = await ruta.POST(peticion(enTrozos), contexto);

    expect(r.status).toBe(200);
    const [, opciones] = fetchFalso.mock.calls[0] as [URL, RequestInit & { duplex?: string }];
    expect(opciones.body).toBeInstanceOf(Uint8Array);
    expect(opciones.duplex).toBeUndefined();
    expect(new TextDecoder().decode(opciones.body as Uint8Array)).toBe(json);
  });

  it('un cuerpo por encima del tope es un 413 de la consola y la API no se entera', async () => {
    const r = await ruta.POST(peticion(new Uint8Array(MAXIMO_CUERPO_DEL_PROXY + 1)), contexto);
    expect(r.status).toBe(413);
    expect(await r.json()).toMatchObject({ estado: 413, mensaje: 'Envío demasiado grande' });
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('un POST sin cuerpo sale sin cuerpo', async () => {
    const r = await ruta.POST(peticion(''), {
      params: Promise.resolve({ ruta: ['copropiedades', 'c', 'mi', 'rostro', 'retiro'] }),
    });
    expect(r.status).toBe(200);
    const [, opciones] = fetchFalso.mock.calls[0] as [URL, RequestInit];
    expect(opciones.body).toBeUndefined();
  });
});

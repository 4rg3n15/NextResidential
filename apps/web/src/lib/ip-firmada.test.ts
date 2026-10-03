import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type * as RutaProxy from '@/app/api/ncr/[...ruta]/route';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · D4 · EN NETLIFY, LA IP DEL PORTERO SALE DE LA CABECERA DE CONFIANZA
 *
 * El navegador escribe lo que quiera en `X-Forwarded-For`; la plataforma
 * escribe —y el navegador NO puede fijar— `x-nf-client-connection-ip`. Con la
 * cabecera de confianza declarada, el proxy BFF real reenvía SÓLO esa IP, y la
 * firma para la API. El vector de la firma es el mismo que el de la API
 * (`apps/api/test/ip-firmada.e2e.test.ts`). IPs de documentación (RFC 5737).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SECRETO = 'secreto-compartido-de-prueba-15r-d4-firma';
const ENTORNO = {
  API_URL: 'http://api.invalid',
  SUPABASE_URL: 'https://proyecto.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'llave-publicable-de-prueba',
  NODE_ENV: 'test',
};

vi.mock('@/lib/sesion/token', () => ({
  tokenVigente: async () => ({ accessToken: 'token-vigente', expiraEn: 1_800_000_600 }),
}));

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENTORNO)) vi.stubEnv(k, v);
  fetchFalso = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Pasa una petición por el proxy BFF real y devuelve las cabeceras que llegan a la API. */
const porElProxy = async (cabeceras: Record<string, string>): Promise<Headers> => {
  const ruta: typeof RutaProxy = await import('@/app/api/ncr/[...ruta]/route');
  const url = 'http://consola/api/ncr/copropiedades/abc/guardia/cola';
  const r = new Request(url, { headers: cabeceras }) as NextRequest;
  Object.defineProperty(r, 'nextUrl', { value: new URL(url) });
  await ruta.GET(r, {
    params: Promise.resolve({ ruta: ['copropiedades', 'abc', 'guardia', 'cola'] }),
  });
  const [, opciones] = fetchFalso.mock.calls[0] as [URL, RequestInit];
  return new Headers(opciones.headers);
};

describe('la firma es la misma que verifica la API', () => {
  it('vector fijo compartido', async () => {
    const { firmaDeIp } = await import('./ip-firmada');
    expect(firmaDeIp(SECRETO, '192.0.2.10', 1_790_000_000)).toBe(
      '1790000000.ojwZULrxXc-fBVcYk-4J1ByFBgtK_ajk3j31pPG0saE',
    );
  });
});

describe('en sitio (sin cabecera de confianza): como siempre, R1', () => {
  it('la IP es la primera de X-Forwarded-For (la escribió servidor.mjs) y no se firma', async () => {
    const llegan = await porElProxy({ 'x-forwarded-for': '192.0.2.10' });
    expect(llegan.get('x-forwarded-for')).toBe('192.0.2.10');
    expect(llegan.get('x-ncr-ip-cliente')).toBeNull();
    expect(llegan.get('x-ncr-ip-firma')).toBeNull();
  });
});

describe('en Netlify (cabecera de confianza + secreto)', () => {
  beforeEach(() => {
    vi.stubEnv('CONSOLA_CABECERA_IP_DE_CONFIANZA', 'x-nf-client-connection-ip');
    vi.stubEnv('CONSOLA_IP_FIRMA_SECRETO', SECRETO);
  });

  it('una X-Forwarded-For escrita por el navegador NO cuenta: manda la de la plataforma', async () => {
    const llegan = await porElProxy({
      'x-forwarded-for': '192.0.2.10, 198.51.100.1',
      'x-nf-client-connection-ip': '203.0.113.66',
    });
    expect(llegan.get('x-forwarded-for')).toBe('203.0.113.66');
    expect(llegan.get('x-ncr-ip-cliente')).toBe('203.0.113.66');
    const firma = llegan.get('x-ncr-ip-firma') ?? '';
    const segundos = Number(firma.split('.')[0]);
    const { firmaDeIp } = await import('./ip-firmada');
    expect(firma).toBe(firmaDeIp(SECRETO, '203.0.113.66', segundos));
    expect(Math.abs(Date.now() / 1000 - segundos)).toBeLessThan(5);
  });

  it('sin la cabecera de la plataforma no se declara ninguna IP', async () => {
    const llegan = await porElProxy({ 'x-forwarded-for': '192.0.2.10' });
    expect(llegan.get('x-forwarded-for')).toBeNull();
    expect(llegan.get('x-ncr-ip-cliente')).toBeNull();
  });

  it('una cabecera de la plataforma que no es una IP no se firma', async () => {
    const llegan = await porElProxy({ 'x-nf-client-connection-ip': '192.0.2.10<script>' });
    expect(llegan.get('x-ncr-ip-cliente')).toBeNull();
  });

  it('las cabeceras de firma que mande el navegador no pasan', async () => {
    const llegan = await porElProxy({
      'x-ncr-ip-cliente': '192.0.2.10',
      'x-ncr-ip-firma': '1.falsa',
    });
    expect(llegan.get('x-ncr-ip-cliente')).toBeNull();
    expect(llegan.get('x-ncr-ip-firma')).toBeNull();
  });
});

describe('la configuración no admite una cabecera falsificable', () => {
  it.each(['X-Forwarded-For', 'forwarded', 'x-real-ip'])('rechaza %s', async (cabecera) => {
    const { despliegue } = await import('./configuracion-de-despliegue');
    expect(() => despliegue({ CONSOLA_CABECERA_IP_DE_CONFIANZA: cabecera })).toThrow(
      /no pueda fijar/,
    );
  });

  it('el secreto sin cabecera de confianza no arranca: firmaría una IP inventada', async () => {
    const { despliegue } = await import('./configuracion-de-despliegue');
    expect(() => despliegue({ CONSOLA_IP_FIRMA_SECRETO: SECRETO })).toThrow(
      /exige CONSOLA_CABECERA_IP_DE_CONFIANZA/,
    );
  });

  it('el origen público: https (o http local), sin ruta; vacío = sitio', async () => {
    const { despliegue } = await import('./configuracion-de-despliegue');
    expect(despliegue({ API_ORIGEN_PUBLICO: 'https://api.ncr.example/v1/' }).apiOrigenPublico).toBe(
      'https://api.ncr.example',
    );
    expect(despliegue({ API_ORIGEN_PUBLICO: '' }).apiOrigenPublico).toBeUndefined();
    expect(() => despliegue({ API_ORIGEN_PUBLICO: 'http://api.ncr.example' })).toThrow(/https/);
  });
});

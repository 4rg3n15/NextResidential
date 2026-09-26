import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type * as RutaProxy from './[...ruta]/route';

/**
 * H-SITIO-08 · EL PROXY REENVÍA TODOS LOS VERBOS QUE ALGUIEN USA.
 *
 * En sitio, el 26/09/2026, ninguna edición de la consola guardaba: el proxy
 * exportaba `GET`, `POST`, `PATCH` y `DELETE`, y Next contestaba `405` a cada
 * `PUT`. Las pantallas se prueban con `fetch` sustituido —nunca pasan por
 * aquí— y la prueba del proxy sólo invocaba `GET`. Entre las dos, el verbo
 * que faltaba no lo veía nadie.
 *
 * La lista NO se escribe a mano: una lista a mano es la misma omisión con otro
 * nombre. Sale de dos fuentes, y las dos tienen que caber en el proxy:
 *
 *   1. El CONTRATO generado: cada verbo con una operación real en `paths`.
 *   2. La CONSOLA: cada `cliente.<VERBO>(` y cada `fetch('/api/ncr/…', { method })`.
 */
const RAIZ = resolve(process.cwd(), '../..');
const CONTRATO = join(RAIZ, 'packages/contracts/src/generado/api.ts');
const FUENTES = join(RAIZ, 'apps/web/src');

const VERBOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

/** Verbos con operación real en el contrato: `put: operations[…]`, no `put?: never`. */
const verbosDelContrato = (texto: string): Set<string> => {
  const encontrados = new Set<string>();
  for (const m of texto.matchAll(
    /^\s+(get|put|post|delete|patch|head|options):\s+operations\[/gm,
  )) {
    encontrados.add(m[1]!.toUpperCase());
  }
  return encontrados;
};

const ficheros = (dir: string): string[] =>
  readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'pruebas' ? [] : ficheros(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.(ts|tsx)$/.test(nombre) ? [ruta] : [];
  });

/** Verbos que la consola usa contra el proxy. */
const verbosDeLaConsola = (textos: readonly string[]): Set<string> => {
  const encontrados = new Set<string>();
  for (const texto of textos) {
    for (const m of texto.matchAll(/\bcliente\.(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\(/g)) {
      encontrados.add(m[1]!);
    }
    // `fetch('/api/ncr/…', { method: 'X' })` escrito a mano (códigos de
    // recuperación, descargas): también pasa por aquí.
    for (const m of texto.matchAll(/fetch\(\s*[`'"]\/api\/ncr\/[^)]*?method:\s*'([A-Z]+)'/gs)) {
      encontrados.add(m[1]!);
    }
  }
  return encontrados;
};

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

describe('H-SITIO-08 · el proxy exporta cada verbo en uso', () => {
  const delContrato = verbosDelContrato(readFileSync(CONTRATO, 'utf8'));
  const deLaConsola = verbosDeLaConsola(ficheros(FUENTES).map((f) => readFileSync(f, 'utf8')));

  it('las dos fuentes se leyeron de verdad (una lista vacía pasaría cualquier aserción)', () => {
    expect(delContrato.size).toBeGreaterThanOrEqual(4);
    expect(deLaConsola.size).toBeGreaterThanOrEqual(4);
    // `PUT` está en los dos: es el verbo que faltó en sitio.
    expect(delContrato.has('PUT')).toBe(true);
    expect(deLaConsola.has('PUT')).toBe(true);
  });

  it.each([...VERBOS])('%s: si el contrato o la consola lo usan, el proxy lo exporta', (verbo) => {
    const enUso = delContrato.has(verbo) || deLaConsola.has(verbo);
    const exportado = typeof (ruta as Record<string, unknown>)[verbo] === 'function';
    if (enUso) expect(exportado, `${verbo} está en uso y el proxy no lo exporta: 405`).toBe(true);
  });

  it('un PUT llega a la API como PUT, con su cuerpo y el token del servidor', async () => {
    const peticion = new Request('http://consola/api/ncr/copropiedades/c/equipos/e', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nombre: 'Portería norte' }),
      duplex: 'half',
    } as RequestInit) as NextRequest;
    Object.defineProperty(peticion, 'nextUrl', { value: new URL(peticion.url) });

    const respuesta = await ruta.PUT(peticion, {
      params: Promise.resolve({ ruta: ['copropiedades', 'c', 'equipos', 'e'] }),
    });

    expect(respuesta.status).toBe(200);
    const [destino, opciones] = fetchFalso.mock.calls[0] as [URL, RequestInit];
    expect(destino.pathname).toBe('/copropiedades/c/equipos/e');
    expect(opciones.method).toBe('PUT');
    expect(new Headers(opciones.headers).get('authorization')).toBe('Bearer token-vigente');
    expect(await new Response(opciones.body).text()).toBe('{"nombre":"Portería norte"}');
  });
});

describe('los extractores detectan lo que dicen detectar', () => {
  it('ignoran `put?: never` y recogen `put: operations[…]`', () => {
    const texto = '    put?: never;\n    post: operations["X"];\n    put: operations["Y"];\n';
    expect([...verbosDelContrato(texto)].sort()).toEqual(['POST', 'PUT']);
    expect(verbosDelContrato('    put?: never;\n').size).toBe(0);
  });

  it('recogen `cliente.PUT(` y un fetch a mano con método', () => {
    const textos = [
      "await cliente.PUT('/x', {})",
      "fetch('/api/ncr/auth/mfa/codigos', { method: 'POST', credentials: 'same-origin' })",
    ];
    expect([...verbosDeLaConsola(textos)].sort()).toEqual(['POST', 'PUT']);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type * as RutaRecuperacion from './route';

/**
 * Lo que esta suite protege es una propiedad de seguridad, no una función:
 * **el formulario de recuperación no puede servir para enumerar usuarios.**
 * Si la respuesta variara —texto, código o camino de ejecución— entre un correo
 * que existe y uno que no, el formulario sería un enumerador con interfaz.
 */
const ENTORNO = {
  API_URL: 'http://api.invalid',
  SUPABASE_URL: 'https://proyecto.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'llave-publicable-de-prueba',
  NODE_ENV: 'test',
};

let ruta: typeof RutaRecuperacion;
let fetchFalso: ReturnType<typeof vi.fn>;

/**
 * La clave del limitador es OPACA: no hace falta que tenga forma de IP, y no la
 * tiene a propósito. El control de KPI-11 marca cualquier literal IPv4 fuera de
 * `packages/providers`, y tiene razón en marcarlo: una dirección en una prueba
 * es una dirección que alguien copia a un fichero de configuración. El análisis
 * de cabeceras se prueba aparte, en `limitador.test.ts`.
 */
const peticion = (cuerpo: unknown, ip = 'cliente-por-defecto'): NextRequest => {
  const r = new Request('http://consola/api/sesion/recuperacion', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(cuerpo),
  }) as NextRequest;
  Object.defineProperty(r, 'nextUrl', { value: new URL('http://consola/api/sesion/recuperacion') });
  return r;
};

beforeEach(async () => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENTORNO)) vi.stubEnv(k, v);
  fetchFalso = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchFalso);
  ruta = await import('./route');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('no permite enumerar usuarios', () => {
  it('un correo que existe y otro que no dan la MISMA respuesta', async () => {
    const existe = await ruta.POST(peticion({ correo: 'existe@x.com' }, 'cliente-1'));
    // Supabase devuelve 200 igualmente, pero se fuerza un 400 para simular el
    // caso en que sí distinguiera: la consola debe seguir sin distinguir.
    fetchFalso.mockResolvedValueOnce(new Response('{"error":"user not found"}', { status: 400 }));
    const noExiste = await ruta.POST(peticion({ correo: 'no-existe@x.com' }, 'cliente-2'));

    expect(existe.status).toBe(noExiste.status);
    expect(await existe.json()).toEqual(await noExiste.json());
  });

  it('un fallo del proveedor tampoco se distingue', async () => {
    fetchFalso.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const res = await ruta.POST(peticion({ correo: 'quien-sea@x.com' }, 'cliente-3'));
    expect(res.status).toBe(200);
  });

  it('un correo mal formado recibe el mismo acuse, no un 400', async () => {
    const res = await ruta.POST(peticion({ correo: 'esto-no-es-un-correo' }, 'cliente-4'));
    expect(res.status).toBe(200);
    expect((await res.json()).mensaje).toMatch(/Si ese correo corresponde/);
  });

  it('el acuse nunca nombra el correo ni dice si existe', async () => {
    const res = await ruta.POST(peticion({ correo: 'objetivo@x.com' }, 'cliente-5'));
    const texto = JSON.stringify(await res.json());
    expect(texto).not.toContain('objetivo@x.com');
    expect(texto).not.toMatch(/no existe|no encontrad|registrad/i);
  });
});

describe('límite de peticiones', () => {
  it('el cupo por IDENTIDAD corta aunque cambie la IP', async () => {
    // Es el caso que un tope por IP no cubre: muchas IP contra un solo buzón.
    const objetivo = 'inundado@x.com';
    const respuestas = [];
    for (let i = 0; i < 5; i += 1) {
      respuestas.push(await ruta.POST(peticion({ correo: objetivo }, `cliente-inundacion-${i}`)));
    }
    expect(respuestas.map((r) => r.status)).toContain(429);
    expect(respuestas.at(-1)?.headers.get('retry-after')).not.toBeNull();
  });

  it('el cupo por IP corta aunque cambie el correo', async () => {
    const respuestas = [];
    for (let i = 0; i < 12; i += 1) {
      respuestas.push(await ruta.POST(peticion({ correo: `c${i}@x.com` }, 'cliente-tope-ip')));
    }
    expect(respuestas.map((r) => r.status)).toContain(429);
  });

  it('el rechazo por límite NO llega al proveedor de identidad', async () => {
    for (let i = 0; i < 4; i += 1)
      await ruta.POST(peticion({ correo: 'tope@x.com' }, 'cliente-tope-a'));
    const llamadas = fetchFalso.mock.calls.length;
    await ruta.POST(peticion({ correo: 'tope@x.com' }, 'cliente-tope-b'));
    expect(fetchFalso.mock.calls.length).toBe(llamadas);
  });
});

describe('la solicitud pide el enlace al proveedor', () => {
  it('con el correo y la URL de redirección de esta consola', async () => {
    await ruta.POST(peticion({ correo: 'valido@x.com' }, 'cliente-9'));
    const [url, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/v1/recover');
    const cuerpo = JSON.parse(String(opciones.body)) as {
      email: string;
      options: { redirectTo: string };
    };
    expect(cuerpo.email).toBe('valido@x.com');
    expect(cuerpo.options.redirectTo).toBe('http://consola/acceso/nueva-contrasena');
  });
});

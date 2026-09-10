import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as RutaAcceso from './route';

/**
 * `MFA_OBLIGATORIO` en la consola · las dos posiciones del interruptor.
 *
 * Lo que importa comprobar no es solo que apagado deje entrar. Es que:
 *
 *  - **Encendido —el valor por defecto— siga exigiendo el segundo factor.** Un
 *    interruptor que no enciende es peor que no tenerlo: la consola creería
 *    estar aplicando RN-20 sin aplicarla, y nadie prueba lo que da por hecho.
 *  - **Apagado no mande a nadie a una pantalla que rebota.** Si la API todavía
 *    exige `aal2`, entrar al tablero devolvería al login sin explicación — que
 *    es el síntoma exacto que motivó este interruptor. La consola lo detecta
 *    ANTES y dice qué variable falta.
 */
const ENTORNO_BASE = {
  API_URL: 'http://api.invalid',
  SUPABASE_URL: 'https://proyecto.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'llave-publicable-de-prueba',
  NODE_ENV: 'test',
};

let ruta: typeof RutaAcceso;
let fetchFalso: ReturnType<typeof vi.fn>;
let galleta: Map<string, string>;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nombre: string) =>
      galleta.has(nombre) ? { name: nombre, value: galleta.get(nombre) } : undefined,
    set: (nombre: string, valor: string) => galleta.set(nombre, valor),
    delete: (nombre: string) => galleta.delete(nombre),
  }),
}));

/** Contraseña correcta, token `aal1`, y un factor TOTP ya verificado. */
const identidadConFactor = { aal: 'aal1', factorVerificado: true };

const proveedor = (opciones: { apiAcepta: boolean }): ReturnType<typeof vi.fn> =>
  vi.fn(async (url: string) => {
    if (url.includes('/auth/v1/token')) {
      return new Response(
        JSON.stringify({
          access_token: `cabecera.${Buffer.from(
            JSON.stringify({ aal: identidadConFactor.aal, rol: 'administrador' }),
          ).toString('base64url')}.firma`,
          refresh_token: 'refresco',
          expires_in: 3600,
          user: {
            factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }],
            app_metadata: { rol: 'administrador' },
          },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/auth/v1/user')) {
      return new Response(
        JSON.stringify({ factors: [{ id: 'factor-1', factor_type: 'totp', status: 'verified' }] }),
        { status: 200 },
      );
    }
    // La API: acepta o no el token `aal1` según su propia política.
    if (url.endsWith('/auth/sesion')) {
      return opciones.apiAcepta
        ? new Response(JSON.stringify({ rol: 'administrador', mfaVerificado: false }), {
            status: 200,
          })
        : new Response('No autenticado', { status: 401 });
    }
    return new Response('{}', { status: 200 });
  });

/**
 * Se sortea: al doble le da igual el valor, y §2.5 no admite una contraseña
 * literal en el repositorio ni siquiera de adorno. El gancho de pre-commit lo
 * señaló al escribir esta misma suite — funciona.
 */
const CONTRASENA_EFIMERA = randomBytes(9).toString('base64url');

const entrar = async (): Promise<Response> =>
  ruta.POST(
    new Request('http://consola.invalid/api/sesion', {
      method: 'POST',
      body: JSON.stringify({ correo: 'alguien@ejemplo.invalid', contrasena: CONTRASENA_EFIMERA }),
    }) as never,
  );

const preparar = async (entorno: Record<string, string>, apiAcepta: boolean): Promise<void> => {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...ENTORNO_BASE, ...entorno })) vi.stubEnv(k, v);
  galleta = new Map();
  fetchFalso = proveedor({ apiAcepta });
  vi.stubGlobal('fetch', fetchFalso);
  ruta = await import('./route');
};

beforeEach(() => {
  galleta = new Map();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('con el valor por defecto la regla sigue en vigor', () => {
  it('un administrador con factor verificado va al segundo factor, no al tablero', async () => {
    await preparar({}, true);
    const res = await entrar();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ siguiente: 'segundo-factor' });
  });

  it('y no se le pregunta nada a la API: la consola no decide por ella', async () => {
    await preparar({}, true);
    await entrar();
    const consultas = (fetchFalso.mock.calls as [string][]).filter(([u]) =>
      u.endsWith('/auth/sesion'),
    );
    expect(consultas).toHaveLength(0);
  });
});

describe('con MFA_OBLIGATORIO=false', () => {
  it('la contraseña correcta lleva directamente a la consola', async () => {
    await preparar({ MFA_OBLIGATORIO: 'false' }, true);
    const res = await entrar();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ siguiente: 'consola' });
  });

  it('si la API SÍ lo exige, se dice qué falta en vez de rebotar al login', async () => {
    await preparar({ MFA_OBLIGATORIO: 'false' }, false);
    const res = await entrar();
    expect(res.status).toBe(409);
    const cuerpo = (await res.json()) as { mensaje: string };
    expect(cuerpo.mensaje).toContain('MFA_OBLIGATORIO');
    expect(cuerpo.mensaje).toContain('API');
  });

  it('unas credenciales equivocadas siguen sin entrar', async () => {
    await preparar({ MFA_OBLIGATORIO: 'false' }, true);
    fetchFalso.mockImplementation(async (url: string) =>
      url.includes('/auth/v1/token')
        ? new Response(JSON.stringify({ error_code: 'invalid_credentials' }), { status: 400 })
        : new Response('{}', { status: 200 }),
    );
    const res = await entrar();
    expect(res.status).toBe(401);
  });
});

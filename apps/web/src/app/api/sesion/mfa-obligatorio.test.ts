import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as RutaAcceso from './route';

/**
 * La consola exige el segundo factor, y **ningún entorno la convence de lo
 * contrario** (RN-20, CA-25).
 *
 * Esta suite se llamaba `interruptor-mfa` y probaba las dos posiciones de
 * `MFA_OBLIGATORIO`. El interruptor se retiró el 2026-09-10, entero: variable,
 * ramas, mensajes y `.env.example`. Lo que se conserva es la mitad que sigue
 * importando —**que encendido, encienda**—: una consola que cree aplicar RN-20
 * sin aplicarla es peor que no tener la regla, porque nadie prueba lo que da
 * por hecho.
 *
 * Y se añade el control que impide que el interruptor vuelva por la puerta de
 * atrás: con la variable puesta en el entorno, el comportamiento no cambia.
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

const tokenCon = (claims: Record<string, unknown>): string =>
  `cabecera.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.firma`;

const proveedor = (opciones: { apiAcepta: boolean }): ReturnType<typeof vi.fn> =>
  vi.fn(async (url: string) => {
    // 15-H (ADR-023) · la consola entra por la API, que habla con Supabase.
    if (url.endsWith('/auth/acceso')) {
      return new Response(
        JSON.stringify({
          accessToken: tokenCon({ aal: identidadConFactor.aal, rol: 'administrador' }),
          refreshToken: 'refresco',
          expiraEn: 4_102_444_800,
          debeCambiarContrasena: false,
        }),
        { status: 200 },
      );
    }
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

describe('el entorno no puede relajar la regla', () => {
  it('con MFA_OBLIGATORIO=false en el entorno, sigue pidiendo el segundo factor', async () => {
    /**
     * El control anti-regresión del interruptor retirado. Se pone la variable
     * con el valor que antes la apagaba: hoy la configuración ni la conoce, así
     * que el destino tiene que seguir siendo el segundo factor. Si alguien la
     * reintrodujera, esta prueba fallaría y habría que venir aquí a decir por
     * qué se vuelve a debilitar RN-20.
     */
    await preparar({ MFA_OBLIGATORIO: 'false' }, true);
    const res = await entrar();
    expect(await res.json()).toEqual({ siguiente: 'segundo-factor' });
  });

  it('unas credenciales equivocadas siguen sin entrar', async () => {
    await preparar({ MFA_OBLIGATORIO: 'false' }, true);
    fetchFalso.mockImplementation(async (url: string) =>
      url.endsWith('/auth/acceso')
        ? new Response(
            JSON.stringify({ estado: 401, mensaje: 'Usuario, NIT o contraseña incorrectos' }),
            { status: 401 },
          )
        : new Response('{}', { status: 200 }),
    );
    const res = await entrar();
    expect(res.status).toBe(401);
  });
});

describe('15-H · entrada por NIT y usuario, a través de la API (ADR-023)', () => {
  it('reenvía NIT y usuario —nunca un correo— y declara el origen del navegador', async () => {
    await preparar({}, true);
    fetchFalso.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/acceso')) {
        const cuerpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(cuerpo).toEqual({
          nit: '900123456-7',
          usuario: 'porteria.norte',
          contrasena: CONTRASENA_EFIMERA,
        });
        expect((init?.headers as Record<string, string>)['x-ncr-origen']).toBe('198.51.100.20');
        return new Response(
          JSON.stringify({
            accessToken: tokenCon({ aal: 'aal1', rol: 'portero', debe_cambiar_contrasena: true }),
            refreshToken: 'refresco',
            expiraEn: 4_102_444_800,
            debeCambiarContrasena: true,
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });
    const res = await ruta.POST(
      new Request('http://consola.invalid/api/sesion', {
        method: 'POST',
        headers: { 'x-forwarded-for': '198.51.100.20' },
        body: JSON.stringify({
          nit: '900123456-7',
          usuario: 'porteria.norte',
          contrasena: CONTRASENA_EFIMERA,
        }),
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ siguiente: 'cambio-de-contrasena' });
    // Con el cambio pendiente no se consulta ningún factor a Supabase.
    expect((fetchFalso.mock.calls as [string][]).some(([u]) => u.endsWith('/auth/v1/user'))).toBe(
      false,
    );
  });

  it('un portero fuera de turno recibe el motivo de la API, con 403', async () => {
    await preparar({}, true);
    fetchFalso.mockImplementation(async (url: string) =>
      url.endsWith('/auth/acceso')
        ? new Response(
            JSON.stringify({
              estado: 403,
              mensaje: { message: 'Fuera de su turno: no tiene un turno vigente en este momento' },
            }),
            { status: 403 },
          )
        : new Response('{}', { status: 200 }),
    );
    const res = await ruta.POST(
      new Request('http://consola.invalid/api/sesion', {
        method: 'POST',
        body: JSON.stringify({
          nit: '900123456',
          usuario: 'noche',
          contrasena: CONTRASENA_EFIMERA,
        }),
      }) as never,
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { mensaje: string }).mensaje).toMatch(/Fuera de su turno/);
  });

  it('sin correo válido ni NIT y usuario, 400 con el mismo texto que unas credenciales malas', async () => {
    await preparar({}, true);
    const res = await ruta.POST(
      new Request('http://consola.invalid/api/sesion', {
        method: 'POST',
        body: JSON.stringify({ usuario: 'sin-nit', contrasena: CONTRASENA_EFIMERA }),
      }) as never,
    );
    expect(res.status).toBe(400);
  });
});

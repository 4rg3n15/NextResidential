import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// El módulo se importa DENTRO de cada prueba, tras `resetModules`, para que
// relea el entorno; el tipo se toma aquí de forma estática.
import type * as SupabaseAuth from './supabase-auth';

/**
 * Cliente de identidad. Es el módulo que ve las contraseñas, así que lo que se
 * comprueba aquí no es solo que funcione: es que **no filtre** y que falle
 * cerrado.
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

/** Token sintético con el `aal` indicado. No está firmado: solo se lee. */
const tokenCon = (aal: string): string => {
  const carga = Buffer.from(JSON.stringify({ aal, sub: 'u1' })).toString('base64url');
  return `cabecera.${carga}.firma`;
};

const respuestaJson = (cuerpo: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(cuerpo), { status: 200, ...init });

let modulo: typeof SupabaseAuth;

beforeEach(async () => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENTORNO)) vi.stubEnv(k, v);
  modulo = await import('./supabase-auth');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('iniciarSesion', () => {
  it('devuelve una sesión aal2 sin preguntar por factores', async () => {
    const fetchFalso = vi.fn(async () =>
      respuestaJson({
        access_token: tokenCon('aal2'),
        refresh_token: 'r1',
        expires_at: 1_800_000_600,
      }),
    );
    vi.stubGlobal('fetch', fetchFalso);

    const sesion = await modulo.iniciarSesion('admin@x.com', 'secreta');
    expect(sesion.nivel).toBe('aal2');
    expect(sesion.factorPendienteId).toBeNull();
    // Una sola llamada: si ya hay aal2, consultar factores sería una petición
    // de más en el camino crítico del inicio de sesión.
    expect(fetchFalso).toHaveBeenCalledTimes(1);
  });

  it('con aal1 y un factor verificado, devuelve el factor pendiente', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/factors')
          ? respuestaJson({ totp: [{ id: 'f1', status: 'verified', factor_type: 'totp' }] })
          : respuestaJson({ access_token: tokenCon('aal1'), refresh_token: 'r1', expires_in: 300 }),
      ),
    );
    const sesion = await modulo.iniciarSesion('admin@x.com', 'secreta');
    expect(sesion.nivel).toBe('aal1');
    expect(sesion.factorPendienteId).toBe('f1');
  });

  it('un factor todavía sin verificar NO cuenta como segundo factor', async () => {
    // Un factor `unverified` es una inscripción a medias. Tratarlo como válido
    // dejaría al usuario en un paso que no puede completar.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/factors')
          ? respuestaJson({ totp: [{ id: 'f1', status: 'unverified', factor_type: 'totp' }] })
          : respuestaJson({ access_token: tokenCon('aal1'), refresh_token: 'r1', expires_in: 300 }),
      ),
    );
    expect((await modulo.iniciarSesion('a@x.com', 's')).factorPendienteId).toBeNull();
  });

  it('un 400 es «credenciales inválidas», no un fallo del servicio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuestaJson({ error: 'x' }, { status: 400 })),
    );
    await expect(modulo.iniciarSesion('a@x.com', 'mala')).rejects.toMatchObject({
      motivo: 'CREDENCIALES_INVALIDAS',
    });
  });

  it('un 429 conserva el Retry-After para poder decírselo al usuario', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuestaJson({}, { status: 429, headers: { 'retry-after': '90' } })),
    );
    await expect(modulo.iniciarSesion('a@x.com', 's')).rejects.toMatchObject({
      motivo: 'DEMASIADOS_INTENTOS',
      reintentarEn: 90,
    });
  });

  it('la red caída se distingue de una contraseña equivocada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    await expect(modulo.iniciarSesion('a@x.com', 's')).rejects.toMatchObject({
      motivo: 'SERVICIO_NO_DISPONIBLE',
    });
  });

  it('una respuesta sin token no se acepta como sesión válida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuestaJson({ ok: true })),
    );
    await expect(modulo.iniciarSesion('a@x.com', 's')).rejects.toMatchObject({
      motivo: 'SERVICIO_NO_DISPONIBLE',
    });
  });

  it('un token ilegible se trata como el nivel MÁS BAJO', async () => {
    // Fallar cerrado (§2.1.4): si no se puede leer el `aal`, se asume aal1 y se
    // exige el segundo factor. Asumir aal2 dejaría entrar sin él.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/factors')
          ? respuestaJson({ totp: [] })
          : respuestaJson({ access_token: 'no-es-un-jwt', refresh_token: 'r', expires_in: 60 }),
      ),
    );
    expect((await modulo.iniciarSesion('a@x.com', 's')).nivel).toBe('aal1');
  });

  it('la contraseña no aparece en el mensaje de ningún error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuestaJson({}, { status: 400 })),
    );
    const error = await modulo.iniciarSesion('a@x.com', 'ContraseñaSecreta123').catch((e) => e);
    expect(JSON.stringify({ mensaje: error.message, nombre: error.name })).not.toContain(
      'ContraseñaSecreta123',
    );
  });
});

describe('verificarSegundoFactor', () => {
  it('encadena desafío y verificación, y devuelve el token ELEVADO', async () => {
    const fetchFalso = vi.fn(async (url: string) =>
      url.endsWith('/challenge')
        ? respuestaJson({ id: 'd1' })
        : respuestaJson({ access_token: tokenCon('aal2'), refresh_token: 'r2', expires_in: 300 }),
    );
    vi.stubGlobal('fetch', fetchFalso);

    const sesion = await modulo.verificarSegundoFactor('token-aal1', 'f1', '123456');
    // El token NUEVO es el que la API acepta: el anterior sigue siendo aal1.
    expect(sesion.nivel).toBe('aal2');
    expect(sesion.accessToken).not.toBe('token-aal1');
    expect(fetchFalso).toHaveBeenCalledTimes(2);
  });

  it('un código equivocado no eleva la sesión', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/challenge')
          ? respuestaJson({ id: 'd1' })
          : respuestaJson({}, { status: 400 }),
      ),
    );
    await expect(modulo.verificarSegundoFactor('t', 'f1', '000000')).rejects.toMatchObject({
      motivo: 'FACTOR_INVALIDO',
    });
  });
});

describe('refrescarSesion', () => {
  it('un refresco rechazado es sesión expirada, no un fallo genérico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuestaJson({}, { status: 401 })),
    );
    await expect(modulo.refrescarSesion('caducado')).rejects.toMatchObject({
      motivo: 'SESION_EXPIRADA',
    });
  });
});

describe('cerrarSesionRemota', () => {
  it('no lanza aunque el servidor no responda', async () => {
    // La sesión local se borra igual: dejar la cookie porque el servidor no
    // contestó sería peor que un token huérfano que caduca solo.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('caído');
      }),
    );
    await expect(modulo.cerrarSesionRemota('t')).resolves.toBeUndefined();
  });
});

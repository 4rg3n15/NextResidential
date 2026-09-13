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
        // GoTrue NO tiene `GET /factors`: los factores viven en el usuario.
        // El doble anterior fingía una ruta inexistente, así que estas pruebas
        // pasaban mientras el código real recibía un 404 y lo leía como «este
        // usuario no tiene factores».
        url.includes('/user')
          ? respuestaJson({ factors: [{ id: 'f1', status: 'verified', factor_type: 'totp' }] })
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
        url.includes('/user')
          ? respuestaJson({ factors: [{ id: 'f1', status: 'unverified', factor_type: 'totp' }] })
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
        url.includes('/user')
          ? respuestaJson({ factors: [] })
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

/**
 * BLOQUE 5 · LA CUENTA CON EL SEGUNDO FACTOR A MEDIAS
 *
 * La inscripción tiene dos pasos separados por una persona: el factor nace
 * `unverified` y sólo pasa a `verified` cuando alguien escanea el QR y manda un
 * código. Entre los dos hay una ventana —se cierra la pestaña, se acaba la
 * batería, se escanea con la aplicación equivocada— en la que el factor
 * **existe y no sirve**. Con él colgando, el guard exige `aal2`, la cuenta no
 * lo alcanza, y hasta hace poco la única salida era el panel de Supabase.
 *
 * El barrido de factores sin verificar ya estaba escrito, pero **nadie lo había
 * visto hacerlo**: ninguna prueba comprobaba que el `DELETE` se emite. Un
 * control sin observar es un control sin demostrar, y este es justo el que
 * decide si un administrador puede volver a entrar solo.
 */
describe('la inscripción barre lo que quedó a medias', () => {
  const factor = (estado: string) => ({ id: 'f-viejo', status: estado, factor_type: 'totp' });

  const espiar = (factores: readonly unknown[]) => {
    const llamadas: { url: string; metodo: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opciones?: { method?: string }) => {
        llamadas.push({ url, metodo: opciones?.method ?? 'GET' });
        if (url.includes('/user')) return respuestaJson({ factors: factores });
        if (url.includes('/factors/')) return respuestaJson({});
        return respuestaJson({
          id: 'f-nuevo',
          totp: { qr_code: '<svg />', secret: 'ABCDEFGH' },
        });
      }),
    );
    return llamadas;
  };

  it('BORRA el factor sin verificar antes de crear el nuevo', async () => {
    const llamadas = espiar([factor('unverified')]);
    const inscripcion = await modulo.inscribirFactorTotp('token-de-prueba');

    const borrado = llamadas.find((l) => l.metodo === 'DELETE');
    expect(borrado, 'no se emitió ningún DELETE del factor a medias').toBeDefined();
    expect(borrado?.url).toContain('/factors/f-viejo');

    // Y el orden importa: crear antes de barrer dejaría dos factores y el
    // proveedor rechazaría el segundo por nombre duplicado.
    const iBorrado = llamadas.findIndex((l) => l.metodo === 'DELETE');
    const iAlta = llamadas.findIndex((l) => l.metodo === 'POST' && l.url.endsWith('/factors'));
    expect(iBorrado).toBeLessThan(iAlta);
    expect(inscripcion.factorId).toBe('f-nuevo');
  });

  it('NO borra un factor ya verificado: se pide verificar, no inscribir de nuevo', async () => {
    // La mitad que impide que el arreglo se convierta en el agujero: si el
    // barrido alcanzara a los verificados, cualquiera podría quitarse el
    // segundo factor abriendo la pantalla de inscripción, y eso es RN-20.
    const llamadas = espiar([factor('verified')]);
    await expect(modulo.inscribirFactorTotp('token-de-prueba')).rejects.toMatchObject({
      motivo: 'SEGUNDO_FACTOR_YA_INSCRITO',
    });
    expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(false);
  });

  it('sin factores previos no borra nada y crea uno', async () => {
    const llamadas = espiar([]);
    await modulo.inscribirFactorTotp('token-de-prueba');
    expect(llamadas.some((l) => l.metodo === 'DELETE')).toBe(false);
  });
});

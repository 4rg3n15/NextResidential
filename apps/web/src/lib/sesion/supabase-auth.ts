import 'server-only';
import { configuracion } from '../configuracion';

/**
 * Cliente mínimo de Supabase Auth (GoTrue), **solo servidor**.
 *
 * Cuatro llamadas y ninguna dependencia: `signInWithPassword`, refresco,
 * verificación del segundo factor y cierre de sesión. Se escribe a mano y no
 * con `@supabase/supabase-js` a propósito —es la única excepción a «cliente
 * generado, nunca escrito a mano», y por eso se justifica aquí—:
 *
 *  - El SDK está pensado para el navegador: gestiona su propio almacenamiento
 *    de sesión, refresca solo y asume que puede leer y escribir. Aquí la sesión
 *    vive en cookies `httpOnly` que solo este servidor toca, así que habría que
 *    desactivar la mitad de lo que hace.
 *  - Son cuatro rutas REST estables y documentadas. Cuatro `fetch` con tipos
 *    propios pesan menos que un SDK entero en el arranque del servidor.
 *
 * **La contraseña no se registra en ningún sitio**, ni siquiera en un error:
 * las respuestas se leen por campos concretos y nunca se vuelca el cuerpo.
 *
 * **Por qué el MFA va por aquí y no por `/auth/mfa/*` de nuestra API.** El
 * guard de autenticación (ETAPA 03) exige `aal2` en el token, y ese claim lo
 * emite Supabase al verificar el factor. Verificar contra nuestra API no
 * cambiaría el token, así que el administrador seguiría sin entrar.
 */

export type MotivoDeFalloDeAcceso =
  | 'CREDENCIALES_INVALIDAS'
  | 'DEMASIADOS_INTENTOS'
  | 'FACTOR_INVALIDO'
  | 'SESION_EXPIRADA'
  | 'ENLACE_NO_VALIDO'
  | 'CONTRASENA_DEBIL'
  | 'SERVICIO_NO_DISPONIBLE';

export class FalloDeAcceso extends Error {
  constructor(
    readonly motivo: MotivoDeFalloDeAcceso,
    /** Segundos que pide esperar el 429, si el servidor los declara. */
    readonly reintentarEn?: number,
  ) {
    super(motivo);
    this.name = 'FalloDeAcceso';
  }
}

export interface SesionSupabase {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiraEn: number;
  /** `aal1` mientras falte el segundo factor; `aal2` cuando ya se verificó. */
  readonly nivel: 'aal1' | 'aal2';
  readonly factorPendienteId: string | null;
  /** Rol del claim, para saber si este usuario NECESITA segundo factor. */
  readonly rol: string | null;
}

/**
 * Los tres roles que RN-20 obliga a proteger con segundo factor.
 *
 * La lista se repite aquí a propósito y no se importa de la API: la consola no
 * comparte código con el backend, y quien hace cumplir la regla sigue siendo el
 * guard. Si las dos se separaran, el síntoma sería una pantalla de inscripción
 * que no aparece cuando debería —molesto— y nunca un acceso indebido, porque la
 * API rechazaría igual. La interfaz oculta; no protege.
 */
export const exigeSegundoFactor = (rol: string | null): boolean =>
  rol === 'superadministrador' || rol === 'administrador' || rol === 'operador_central';

interface RespuestaToken {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
}

interface Factor {
  id: string;
  status: string;
  factor_type: string;
}

const cabeceras = (token?: string): HeadersInit => {
  const { supabasePublishableKey } = configuracion();
  return {
    'Content-Type': 'application/json',
    apikey: supabasePublishableKey,
    Authorization: `Bearer ${token ?? supabasePublishableKey}`,
  };
};

/** `aal` y `rol` salen del propio token: es lo que la API va a verificar. */
const claimsDelToken = (accessToken: string): { nivel: 'aal1' | 'aal2'; rol: string | null } => {
  const carga = accessToken.split('.')[1];
  if (carga === undefined) return { nivel: 'aal1', rol: null };
  try {
    const json = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as {
      aal?: unknown;
      rol?: unknown;
    };
    return {
      nivel: json.aal === 'aal2' ? 'aal2' : 'aal1',
      rol: typeof json.rol === 'string' ? json.rol : null,
    };
  } catch {
    // Un token que no se puede leer se trata como el nivel MÁS BAJO, no como
    // el más alto: fallar cerrado (§2.1.4).
    return { nivel: 'aal1', rol: null };
  }
};

const aSesion = (cuerpo: RespuestaToken, factorPendienteId: string | null): SesionSupabase => {
  const accessToken = cuerpo.access_token;
  const refreshToken = cuerpo.refresh_token;
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    throw new FalloDeAcceso('SERVICIO_NO_DISPONIBLE');
  }
  const expiraEn =
    typeof cuerpo.expires_at === 'number'
      ? cuerpo.expires_at
      : Math.floor(Date.now() / 1000) + (cuerpo.expires_in ?? 3600);
  const { nivel, rol } = claimsDelToken(accessToken);
  return { accessToken, refreshToken, expiraEn, nivel, rol, factorPendienteId };
};

const pedir = async (ruta: string, opciones: RequestInit): Promise<Response> => {
  const { supabaseUrl } = configuracion();
  try {
    return await fetch(`${supabaseUrl}${ruta}`, { ...opciones, cache: 'no-store' });
  } catch {
    // Red caída, DNS, TLS: el usuario necesita saber que no es su contraseña.
    throw new FalloDeAcceso('SERVICIO_NO_DISPONIBLE');
  }
};

const exigirOk = (respuesta: Response, siInvalido: MotivoDeFalloDeAcceso): void => {
  if (respuesta.ok) return;
  if (respuesta.status === 429) {
    const espera = Number(respuesta.headers.get('retry-after') ?? '60');
    throw new FalloDeAcceso('DEMASIADOS_INTENTOS', Number.isFinite(espera) ? espera : 60);
  }
  if (respuesta.status === 400 || respuesta.status === 401 || respuesta.status === 403) {
    throw new FalloDeAcceso(siInvalido);
  }
  throw new FalloDeAcceso('SERVICIO_NO_DISPONIBLE');
};

/** Factores TOTP ya inscritos y verificados por el titular. */
const factorTotp = async (accessToken: string): Promise<string | null> => {
  const respuesta = await pedir('/auth/v1/factors', {
    method: 'GET',
    headers: cabeceras(accessToken),
  });
  if (!respuesta.ok) return null;
  const cuerpo = (await respuesta.json()) as { totp?: Factor[]; all?: Factor[] };
  const candidatos = cuerpo.totp ?? cuerpo.all ?? [];
  const verificado = candidatos.find((f) => f.factor_type === 'totp' && f.status === 'verified');
  return verificado?.id ?? null;
};

export const iniciarSesion = async (
  correo: string,
  contrasena: string,
): Promise<SesionSupabase> => {
  const respuesta = await pedir('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({ email: correo, password: contrasena }),
  });
  exigirOk(respuesta, 'CREDENCIALES_INVALIDAS');
  const sesion = aSesion((await respuesta.json()) as RespuestaToken, null);
  if (sesion.nivel === 'aal2') return sesion;
  return { ...sesion, factorPendienteId: await factorTotp(sesion.accessToken) };
};

export const refrescarSesion = async (refreshToken: string): Promise<SesionSupabase> => {
  const respuesta = await pedir('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  exigirOk(respuesta, 'SESION_EXPIRADA');
  return aSesion((await respuesta.json()) as RespuestaToken, null);
};

/**
 * Verifica el TOTP y **eleva la sesión a `aal2`**. Supabase devuelve un token
 * nuevo: el anterior sigue siendo `aal1` y la API lo seguiría rechazando, así
 * que hay que sustituirlo, no complementarlo.
 */
export const verificarSegundoFactor = async (
  accessToken: string,
  factorId: string,
  codigo: string,
): Promise<SesionSupabase> => {
  const desafio = await pedir(`/auth/v1/factors/${factorId}/challenge`, {
    method: 'POST',
    headers: cabeceras(accessToken),
  });
  exigirOk(desafio, 'FACTOR_INVALIDO');
  const { id: challengeId } = (await desafio.json()) as { id: string };

  const verificacion = await pedir(`/auth/v1/factors/${factorId}/verify`, {
    method: 'POST',
    headers: cabeceras(accessToken),
    body: JSON.stringify({ challenge_id: challengeId, code: codigo }),
  });
  exigirOk(verificacion, 'FACTOR_INVALIDO');
  return aSesion((await verificacion.json()) as RespuestaToken, null);
};

/**
 * Solicita el correo de recuperación.
 *
 * **Devuelve `void` pase lo que pase, y eso es la decisión.** Supabase responde
 * igual exista o no la cuenta —por diseño—, pero un fallo de red o un 500 sí
 * se distinguirían desde fuera si los propagáramos: el atacante mediría el
 * tiempo o el código y sabría qué correos existen. Aquí se traga todo salvo el
 * límite de peticiones, que el usuario necesita conocer para no seguir
 * intentándolo.
 */
export const solicitarRecuperacion = async (
  correo: string,
  urlDeRedireccion: string,
): Promise<void> => {
  try {
    const respuesta = await pedir('/auth/v1/recover', {
      method: 'POST',
      headers: cabeceras(),
      body: JSON.stringify({ email: correo, options: { redirectTo: urlDeRedireccion } }),
    });
    if (respuesta.status === 429) {
      const espera = Number(respuesta.headers.get('retry-after') ?? '60');
      throw new FalloDeAcceso('DEMASIADOS_INTENTOS', Number.isFinite(espera) ? espera : 60);
    }
  } catch (e) {
    if (e instanceof FalloDeAcceso && e.motivo === 'DEMASIADOS_INTENTOS') throw e;
    // Cualquier otro fallo se silencia a propósito: propagarlo permitiría
    // distinguir «este correo existe» de «este correo no existe» por el
    // comportamiento, que es justo lo que la respuesta uniforme evita.
  }
};

/**
 * Canjea el `token_hash` del enlace del correo por una sesión de recuperación.
 *
 * Se usa el flujo de `token_hash` y no el de fragmento (`#access_token=…`)
 * porque el token del fragmento **nunca llega al servidor**: se queda en el
 * navegador, y la consola tendría que manipularlo en JavaScript, que es
 * exactamente lo que el patrón BFF evita. Con `token_hash` el canje ocurre en
 * el servidor y el resultado va directo a la cookie `httpOnly`.
 *
 * El enlace es de **un solo uso**: Supabase invalida el hash al canjearlo, así
 * que un segundo intento con el mismo enlace falla. No hay que implementarlo.
 */
export const canjearTokenDeRecuperacion = async (tokenHash: string): Promise<SesionSupabase> => {
  const respuesta = await pedir('/auth/v1/verify', {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({ type: 'recovery', token_hash: tokenHash }),
  });
  exigirOk(respuesta, 'ENLACE_NO_VALIDO');
  return aSesion((await respuesta.json()) as RespuestaToken, null);
};

/** Fija la contraseña nueva con la sesión de recuperación ya canjeada. */
export const cambiarContrasena = async (accessToken: string, contrasena: string): Promise<void> => {
  const respuesta = await pedir('/auth/v1/user', {
    method: 'PUT',
    headers: cabeceras(accessToken),
    body: JSON.stringify({ password: contrasena }),
  });
  // 422 es la respuesta de Supabase a una contraseña que no cumple su política
  // —longitud, complejidad—. Se distingue del enlace caducado porque la salida
  // del usuario es distinta: ahí hay que elegir otra contraseña, no pedir otro
  // correo.
  if (respuesta.status === 422) throw new FalloDeAcceso('CONTRASENA_DEBIL');
  exigirOk(respuesta, 'ENLACE_NO_VALIDO');
};

export interface InscripcionDeFactor {
  readonly factorId: string;
  /** SVG del código QR que devuelve Supabase, listo para un `<img src>`. */
  readonly qr: string;
  /** El secreto en texto, para quien no puede escanear. */
  readonly secreto: string;
}

/**
 * Inscribe un factor TOTP **con la sesión del propio titular**.
 *
 * Funciona con una sesión `aal1`, y ese es el punto: quien todavía no tiene
 * segundo factor no puede presentar otra cosa. Es también la razón de que esto
 * viva en la consola y no en el panel de Supabase — el panel solo ofrece
 * RETIRAR factores de un usuario, no darlos de alta, y hace bien: un factor
 * inscrito por un tercero no es un segundo factor.
 *
 * Antes de inscribir se retiran los factores **no verificados** que hubiera.
 * Se acumulan cuando alguien empieza la inscripción y la abandona —cerrar la
 * pestaña basta—, y Supabase rechaza inscribir con un nombre repetido, así que
 * sin esta limpieza el segundo intento fallaría sin explicación.
 */
export const inscribirFactorTotp = async (
  accessToken: string,
  nombreAmistoso = 'Next Control Residencial',
): Promise<InscripcionDeFactor> => {
  const existentes = await pedir('/auth/v1/factors', {
    method: 'GET',
    headers: cabeceras(accessToken),
  });
  if (existentes.ok) {
    const cuerpo = (await existentes.json()) as { totp?: Factor[]; all?: Factor[] };
    for (const factor of cuerpo.totp ?? cuerpo.all ?? []) {
      if (factor.status !== 'verified') {
        await pedir(`/auth/v1/factors/${factor.id}`, {
          method: 'DELETE',
          headers: cabeceras(accessToken),
        }).catch(() => undefined);
      }
    }
  }

  const respuesta = await pedir('/auth/v1/factors', {
    method: 'POST',
    headers: cabeceras(accessToken),
    body: JSON.stringify({ factor_type: 'totp', friendly_name: nombreAmistoso }),
  });
  exigirOk(respuesta, 'FACTOR_INVALIDO');

  const cuerpo = (await respuesta.json()) as {
    id?: string;
    totp?: { qr_code?: string; secret?: string };
  };
  if (typeof cuerpo.id !== 'string' || cuerpo.totp === undefined) {
    throw new FalloDeAcceso('SERVICIO_NO_DISPONIBLE');
  }
  return {
    factorId: cuerpo.id,
    qr: cuerpo.totp.qr_code ?? '',
    secreto: cuerpo.totp.secret ?? '',
  };
};

/** Factores TOTP del titular, para saber si hay algo que inscribir. */
export const factoresDe = async (
  accessToken: string,
): Promise<{ readonly verificados: number; readonly total: number }> => {
  const respuesta = await pedir('/auth/v1/factors', {
    method: 'GET',
    headers: cabeceras(accessToken),
  });
  if (!respuesta.ok) return { verificados: 0, total: 0 };
  const cuerpo = (await respuesta.json()) as { totp?: Factor[]; all?: Factor[] };
  const factores = (cuerpo.totp ?? cuerpo.all ?? []).filter((f) => f.factor_type === 'totp');
  return {
    verificados: factores.filter((f) => f.status === 'verified').length,
    total: factores.length,
  };
};

export const cerrarSesionRemota = async (accessToken: string): Promise<void> => {
  // Si falla, la sesión local se borra igual: dejar la cookie porque el
  // servidor no contestó sería peor que un token huérfano que caduca solo.
  await pedir('/auth/v1/logout', { method: 'POST', headers: cabeceras(accessToken) }).catch(
    () => undefined,
  );
};

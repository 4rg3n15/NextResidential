import 'server-only';
import { configuracion } from '../configuracion';
import { FalloDeAcceso, factorTotp } from './supabase-auth';
import type { SesionSupabase } from './supabase-auth';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ACCESO POR LA API · ETAPA 15-H (ADR-023)
 *
 * Hasta la 15-E la consola pedía el token a Supabase directamente. Desde la
 * 15-H lo pide a la API, por dos motivos que la consola sola no podía cumplir:
 *
 *  · El usuario por NOMBRE (NIT + usuario) necesita el correo sintético, y ese
 *    correo sólo existe en la API: aquí no se construye ni se ve nunca.
 *  · El turno del portero y los límites por cuenta se imponen en el servidor.
 *    Un camino de entrada que no pase por la API se los saltaría.
 *
 * Las cuentas por correo entran por el MISMO camino, así que no hay dos
 * puertas con reglas distintas.
 *
 * La dirección del navegador se DECLARA a la API (`x-ncr-origen`): detrás de
 * la consola todas las peticiones salen de la misma IP y el límite por
 * dirección las sumaría a todas. La API la usa para su límite por origen y la
 * guarda como «origen declarado» en la bitácora; no la trata como prueba de
 * nada.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type IdentificadorDeAcceso =
  | { readonly correo: string }
  | { readonly nit: string; readonly usuario: string };

export interface OrigenDelNavegador {
  readonly ip: string | null;
  readonly agente: string | null;
}

export interface SesionDeLaApi extends SesionSupabase {
  readonly debeCambiarContrasena: boolean;
}

const claims = (accessToken: string): { aal: unknown; rol: unknown } => {
  try {
    const carga = accessToken.split('.')[1] ?? '';
    return JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as {
      aal: unknown;
      rol: unknown;
    };
  } catch {
    return { aal: null, rol: null };
  }
};

/** El texto que la API pone en un 4xx, envuelto por su filtro global. */
export const mensajeDeLaApi = async (respuesta: Response): Promise<string | undefined> => {
  try {
    const cuerpo = (await respuesta.json()) as { mensaje?: unknown };
    const m = cuerpo.mensaje;
    if (typeof m === 'string') return m;
    const interno = (m as { message?: unknown } | undefined)?.message;
    return typeof interno === 'string' ? interno : undefined;
  } catch {
    return undefined;
  }
};

export const accederPorApi = async (
  identificador: IdentificadorDeAcceso,
  contrasena: string,
  origen: OrigenDelNavegador,
): Promise<SesionDeLaApi> => {
  const { apiUrl } = configuracion();
  let respuesta: Response;
  try {
    respuesta = await fetch(`${apiUrl}/auth/acceso`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(origen.ip === null ? {} : { 'x-ncr-origen': origen.ip.slice(0, 100) }),
        ...(origen.agente === null ? {} : { 'x-ncr-agente': origen.agente.slice(0, 300) }),
      },
      body: JSON.stringify({ ...identificador, contrasena }),
      cache: 'no-store',
    });
  } catch {
    throw new FalloDeAcceso('SERVICIO_NO_DISPONIBLE');
  }

  if (respuesta.status === 400 || respuesta.status === 401) {
    throw new FalloDeAcceso('CREDENCIALES_INVALIDAS');
  }
  if (respuesta.status === 429) {
    const segundos = Number(respuesta.headers.get('retry-after') ?? '60');
    throw new FalloDeAcceso('DEMASIADOS_INTENTOS', Number.isFinite(segundos) ? segundos : 60);
  }
  if (respuesta.status === 403) {
    throw new FalloDeAcceso('ACCESO_DENEGADO', undefined, {
      mensaje: await mensajeDeLaApi(respuesta),
    });
  }
  if (!respuesta.ok) {
    throw new FalloDeAcceso('SERVICIO_RESPONDIO_ERROR', undefined, { estado: respuesta.status });
  }

  const c = (await respuesta.json()) as {
    accessToken?: unknown;
    refreshToken?: unknown;
    expiraEn?: unknown;
    debeCambiarContrasena?: unknown;
  };
  if (
    typeof c.accessToken !== 'string' ||
    typeof c.refreshToken !== 'string' ||
    typeof c.expiraEn !== 'number'
  ) {
    throw new FalloDeAcceso('SERVICIO_RESPONDIO_ERROR', undefined, { estado: respuesta.status });
  }
  const { aal, rol } = claims(c.accessToken);
  const nivel = aal === 'aal2' ? 'aal2' : 'aal1';
  return {
    accessToken: c.accessToken,
    refreshToken: c.refreshToken,
    expiraEn: c.expiraEn,
    nivel,
    rol: typeof rol === 'string' ? rol : null,
    // Con el cambio pendiente no se pregunta por factores: el primer paso es
    // cambiar la contraseña, y la API no deja hacer nada más hasta entonces.
    factorPendienteId:
      nivel === 'aal2' || c.debeCambiarContrasena === true ? null : await factorTotp(c.accessToken),
    debeCambiarContrasena: c.debeCambiarContrasena === true,
  };
};

/**
 * Cierre en la API ANTES que en el proveedor: la API cierra el registro de la
 * sesión del portero y deja constancia. Si fallara, el cierre en el proveedor
 * sigue; la API rechazaría el token igual al caducar la sesión registrada.
 */
export const cerrarEnLaApi = async (accessToken: string): Promise<void> => {
  const { apiUrl } = configuracion();
  await fetch(`${apiUrl}/auth/cierre`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  }).catch(() => undefined);
};

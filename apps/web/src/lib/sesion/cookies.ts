import 'server-only';
import { cookies } from 'next/headers';
import { configuracion } from '../configuracion';

/**
 * La sesión vive en cookies `httpOnly`, no en `localStorage`.
 *
 * Es la única decisión de esta capa que merece explicación. Guardar el token
 * donde el JavaScript de la página puede leerlo convierte cualquier XSS en un
 * robo de sesión permanente: el atacante se lleva el token y lo usa desde
 * fuera. Con `httpOnly` no puede leerlo, y como la consola nunca envía el token
 * desde el navegador —lo pone el proxy del servidor—, tampoco lo necesita.
 *
 * `SameSite=Lax` y no `Strict`: `Strict` rompería la vuelta desde un enlace
 * externo —un correo de alerta que lleva a un evento— obligando a reautenticar
 * sin motivo. `Lax` no envía la cookie en peticiones de escritura entre sitios,
 * que es lo que importa.
 */

export const COOKIE_ACCESO = 'ncr_acceso';
export const COOKIE_REFRESCO = 'ncr_refresco';
export const COOKIE_EXPIRA = 'ncr_expira';
/** Marca legible por el servidor para saber si hay un segundo factor pendiente. */
export const COOKIE_FACTOR_PENDIENTE = 'ncr_factor';
/**
 * Copropiedad elegida por quien alcanza varias (superadministrador, operador de
 * central). Es una PREFERENCIA, no una credencial: el servidor la contrasta
 * siempre contra el catálogo que devuelve la API, así que una cookie manipulada
 * no amplía el alcance, solo se descarta.
 *
 * `httpOnly` igual que las demás, por la regla de 09-A: nada de la sesión se
 * expone a JavaScript, ni siquiera lo que no es secreto. Dos reglas distintas
 * para dos cookies del mismo flujo acaban en que alguien aplica la floja a la
 * que no tocaba.
 */
export const COOKIE_COPROPIEDAD = 'ncr_copropiedad';

export interface SesionAlmacenada {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Instante de expiración en segundos desde la época, tal como lo da Supabase. */
  readonly expiraEn: number;
}

const base = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: configuracion().cookieSegura,
  path: '/',
});

export const guardarSesion = async (sesion: SesionAlmacenada): Promise<void> => {
  const almacen = await cookies();
  // La cookie de acceso caduca CON el token. Una cookie que vive más que su
  // contenido produce el peor de los estados: la consola cree que hay sesión,
  // la API responde 401 en cada llamada y el usuario no entiende nada.
  almacen.set(COOKIE_ACCESO, sesion.accessToken, {
    ...base(),
    expires: new Date(sesion.expiraEn * 1000),
  });
  // La de refresco vive más: es la que permite renovar sin volver a pedir
  // contraseña. 30 días, que es lo que dura «recordar sesión en este equipo».
  almacen.set(COOKIE_REFRESCO, sesion.refreshToken, {
    ...base(),
    maxAge: 60 * 60 * 24 * 30,
  });
  almacen.set(COOKIE_EXPIRA, String(sesion.expiraEn), {
    ...base(),
    maxAge: 60 * 60 * 24 * 30,
  });
};

export const leerSesion = async (): Promise<SesionAlmacenada | null> => {
  const almacen = await cookies();
  const accessToken = almacen.get(COOKIE_ACCESO)?.value;
  const refreshToken = almacen.get(COOKIE_REFRESCO)?.value;
  const expira = Number(almacen.get(COOKIE_EXPIRA)?.value ?? '0');
  if (!refreshToken) return null;
  return { accessToken: accessToken ?? '', refreshToken, expiraEn: expira };
};

export const borrarSesion = async (): Promise<void> => {
  const almacen = await cookies();
  for (const nombre of [
    COOKIE_ACCESO,
    COOKIE_REFRESCO,
    COOKIE_EXPIRA,
    COOKIE_FACTOR_PENDIENTE,
    COOKIE_COPROPIEDAD,
  ]) {
    almacen.delete(nombre);
  }
};

export const marcarFactorPendiente = async (factorId: string | null): Promise<void> => {
  const almacen = await cookies();
  if (factorId === null) almacen.delete(COOKIE_FACTOR_PENDIENTE);
  else almacen.set(COOKIE_FACTOR_PENDIENTE, factorId, { ...base(), maxAge: 600 });
};

export const factorPendiente = async (): Promise<string | null> => {
  const almacen = await cookies();
  return almacen.get(COOKIE_FACTOR_PENDIENTE)?.value ?? null;
};

/** Preferencia de copropiedad. No concede nada: el servidor la valida. */
export const guardarCopropiedadElegida = async (id: string): Promise<void> => {
  const almacen = await cookies();
  almacen.set(COOKIE_COPROPIEDAD, id, { ...base(), maxAge: 60 * 60 * 24 * 30 });
};

export const copropiedadElegida = async (): Promise<string | null> => {
  const almacen = await cookies();
  return almacen.get(COOKIE_COPROPIEDAD)?.value ?? null;
};

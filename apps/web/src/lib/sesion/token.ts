import 'server-only';
import { borrarSesion, guardarSesion, leerSesion } from './cookies';
import { FalloDeAcceso, refrescarSesion } from './supabase-auth';
import { MARGEN_SEGUNDOS } from './margen';

/**
 * Token de acceso vigente, **renovado por anticipación y no por reacción**.
 *
 * Es la pieza que el enunciado de la etapa señala: la expiración de Supabase es
 * de pocos minutos, y refrescar de forma perezosa —esperar al 401 y entonces
 * renovar— tumba la conexión SSE, porque el flujo ya está abierto y no hay a
 * quién devolverle el 401. Aquí se renueva cuando faltan menos de
 * `MARGEN_SEGUNDOS`, así que ningún consumidor ve nunca un token caducado.
 *
 * El margen es de 60 s y no de 10: el reloj del servidor y el de Supabase
 * pueden ir desalineados, y una petición puede tardar. Renovar de más cuesta
 * una llamada; renovar de menos cuesta una sesión caída.
 */
export { MARGEN_SEGUNDOS } from './margen';

export interface TokenVigente {
  readonly accessToken: string;
  /** Instante de expiración, para que el cliente sepa cuándo volver a pedir. */
  readonly expiraEn: number;
}

export const tokenVigente = async (ahora = Date.now()): Promise<TokenVigente | null> => {
  const sesion = await leerSesion();
  if (sesion === null) return null;

  const segundos = Math.floor(ahora / 1000);
  if (sesion.accessToken !== '' && sesion.expiraEn - segundos > MARGEN_SEGUNDOS) {
    return { accessToken: sesion.accessToken, expiraEn: sesion.expiraEn };
  }

  try {
    const renovada = await refrescarSesion(sesion.refreshToken);
    await guardarSesion({
      accessToken: renovada.accessToken,
      refreshToken: renovada.refreshToken,
      expiraEn: renovada.expiraEn,
    });
    return { accessToken: renovada.accessToken, expiraEn: renovada.expiraEn };
  } catch (e) {
    // Un refresco rechazado significa sesión revocada o caducada de verdad. Se
    // borra la cookie: dejarla haría que la consola reintentara en bucle.
    // 15-P · el borrado tampoco puede lanzar: sin token, null y a /acceso.
    if (e instanceof FalloDeAcceso) await borrarSesion().catch(() => undefined);
    return null;
  }
};

/**
 * 15-P · 0.3 · EL TOKEN PARA UN COMPONENTE DE SERVIDOR: SÓLO LEE.
 *
 * Next prohíbe escribir cookies al pintar, así que aquí no se renueva: la
 * renovación de una navegación ya la hizo el middleware
 * (`renovar-en-middleware.ts`) y dejó el token nuevo en la petición. Un token
 * aún válido dentro del margen se usa (si el middleware no pudo renovar por la
 * red, sigue sirviendo); uno vencido o ausente es `null`, y la página manda a
 * /acceso sin lanzar.
 */
export const tokenDeLectura = async (ahora = Date.now()): Promise<TokenVigente | null> => {
  const sesion = await leerSesion();
  if (sesion === null || sesion.accessToken === '') return null;
  return sesion.expiraEn > Math.floor(ahora / 1000)
    ? { accessToken: sesion.accessToken, expiraEn: sesion.expiraEn }
    : null;
};

import 'server-only';
import { cache } from 'react';
import type { EstadoDeSesionDePorteria } from '@ncr/contracts';
import { configuracion } from '../configuracion';
import { tokenVigente } from './token';

/**
 * Lo que la consola necesita saber del token ANTES de pintar nada (15-H).
 *
 * Se lee de la carga del token sin verificar la firma: aquí no decide nada. La
 * API vuelve a verificarlo en cada petición y es la que niega; esto sólo elige
 * qué PANTALLA enseñar —el cambio obligatorio, el bloqueo de patrullaje— en
 * vez de pintar la consola para que cada petición suya reciba un 403.
 */
export interface ClaimsVisibles {
  readonly rol: string | null;
  readonly debeCambiarContrasena: boolean;
}

export const claimsVisibles = cache(async (): Promise<ClaimsVisibles | null> => {
  const token = await tokenVigente();
  if (token === null) return null;
  try {
    const carga = token.accessToken.split('.')[1] ?? '';
    const c = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as {
      rol?: unknown;
      debe_cambiar_contrasena?: unknown;
    };
    return {
      rol: typeof c.rol === 'string' ? c.rol : null,
      debeCambiarContrasena: c.debe_cambiar_contrasena === true,
    };
  } catch {
    return { rol: null, debeCambiarContrasena: false };
  }
});

/**
 * El estado de la sesión del PORTERO: activa (con su código), patrullaje,
 * cerrada o fuera de turno. Es la única ruta de la consola del portero que la
 * API admite en patrullaje y fuera de turno, precisamente para esto.
 */
export const estadoDePorteria = cache(async (): Promise<EstadoDeSesionDePorteria | null> => {
  const token = await tokenVigente();
  if (token === null) return null;
  const { apiUrl } = configuracion();
  try {
    const r = await fetch(`${apiUrl}/porteria/sesion`, {
      headers: { Authorization: `Bearer ${token.accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    return r.ok ? ((await r.json()) as EstadoDeSesionDePorteria) : null;
  } catch {
    return null;
  }
});

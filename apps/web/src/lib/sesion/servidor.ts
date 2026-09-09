import 'server-only';
import { cache } from 'react';
import type { Sesion } from '@ncr/contracts';
import { configuracion } from '../configuracion';
import { tokenVigente } from './token';

/**
 * Sesión vista desde el servidor: se le pregunta a la API, no al token.
 *
 * Se podría leer el rol decodificando el JWT aquí, y sería más rápido. No se
 * hace: el rol y el alcance son **lo que la API reconoce**, y decodificar el
 * token por nuestra cuenta crearía una segunda interpretación de los claims que
 * se separaría de la del guard a la primera diferencia —un claim renombrado, un
 * rol nuevo—. `GET /auth/sesion` existe justamente para no tener dos.
 *
 * `cache` de React deduplica la llamada dentro de una misma petición: el layout
 * y la página la piden ambos y solo sale una al servidor.
 */
export const sesionActual = cache(async (): Promise<Sesion | null> => {
  const token = await tokenVigente();
  if (token === null) return null;

  const { apiUrl } = configuracion();
  try {
    const respuesta = await fetch(`${apiUrl}/auth/sesion`, {
      headers: { Authorization: `Bearer ${token.accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!respuesta.ok) return null;
    return (await respuesta.json()) as Sesion;
  } catch {
    // API caída: no hay sesión *utilizable*. Devolver una sesión a medias haría
    // que el layout pintara una navegación que no lleva a ninguna parte.
    return null;
  }
});

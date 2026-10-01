import type { NextRequest } from 'next/server';
import { decidirToken } from './decidir-vencimiento';
import { MARGEN_SEGUNDOS } from './margen';
import { FalloDeAcceso, refrescarSesion } from './supabase-auth';
import { COOKIE_ACCESO, COOKIE_EXPIRA, COOKIE_REFRESCO } from './nombres-de-cookies';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · BLOQUE 0.3 · RENOVAR EL TOKEN DONDE SE PUEDEN ESCRIBIR COOKIES
 *
 * `tokenVigente()` renovaba y ESCRIBÍA las cookies desde donde lo llamaran,
 * también desde componentes de servidor (el layout, cada página). Next prohíbe
 * escribir cookies ahí y lanza; y como Supabase ROTA el refresco al usarlo, un
 * refresco que no se guarda destruye la sesión aunque fuera válida. Si el
 * refresco fallaba, `borrarSesion()` volvía a lanzar dentro del `catch`.
 *
 * Ahora la renovación de una NAVEGACIÓN la hace el middleware, antes de que se
 * pinte nada: escribe las cookies en la respuesta (para el navegador) y en la
 * petición (para que los componentes de esta misma petición lean el token
 * nuevo). Los componentes sólo LEEN (`tokenDeLectura`). Un refresco rechazado
 * borra las cookies y la página manda a /acceso, sin lanzar.
 *
 * Las rutas `/api/*` siguen renovando en su manejador, que sí puede escribir.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface CookieDeSesion {
  readonly nombre: string;
  readonly valor: string;
  readonly opciones: {
    readonly httpOnly: true;
    readonly sameSite: 'lax';
    readonly secure: boolean;
    readonly path: '/';
    readonly expires?: Date;
  };
}

export type Renovacion =
  | { readonly tipo: 'nada' }
  | { readonly tipo: 'renovada'; readonly cookies: readonly CookieDeSesion[] }
  | { readonly tipo: 'revocada'; readonly borrar: readonly string[] };

export const renovarSiHaceFalta = async (
  peticion: Pick<NextRequest, 'cookies'>,
  seguro: boolean,
  ahoraMs = Date.now(),
): Promise<Renovacion> => {
  const refresco = peticion.cookies.get(COOKIE_REFRESCO)?.value ?? '';
  const decision = decidirToken(
    {
      hayRefresco: refresco !== '',
      accessToken: peticion.cookies.get(COOKIE_ACCESO)?.value ?? '',
      expiraEn: Number(peticion.cookies.get(COOKIE_EXPIRA)?.value ?? '0'),
    },
    Math.floor(ahoraMs / 1000),
    MARGEN_SEGUNDOS,
  );
  if (decision !== 'renovar') return { tipo: 'nada' };
  try {
    const nueva = await refrescarSesion(refresco);
    const base = { httpOnly: true, sameSite: 'lax', secure: seguro, path: '/' } as const;
    return {
      tipo: 'renovada',
      cookies: [
        {
          nombre: COOKIE_ACCESO,
          valor: nueva.accessToken,
          opciones: { ...base, expires: new Date(nueva.expiraEn * 1000) },
        },
        { nombre: COOKIE_REFRESCO, valor: nueva.refreshToken, opciones: base },
        { nombre: COOKIE_EXPIRA, valor: String(nueva.expiraEn), opciones: base },
      ],
    };
  } catch (error) {
    // Rechazado de verdad (revocado, caducado): fuera la sesión. Cualquier otro
    // fallo (la red) no borra nada: el token puede seguir siendo válido.
    return error instanceof FalloDeAcceso
      ? { tipo: 'revocada', borrar: [COOKIE_ACCESO, COOKIE_REFRESCO, COOKIE_EXPIRA] }
      : { tipo: 'nada' };
  }
};

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { construirCsp, generarNonce } from './middleware-csp';

/**
 * Nonce por petición y cabeceras de seguridad (§2.7.7).
 *
 * El nonce viaja en la cabecera de la PETICIÓN (`x-nonce`) además de en la
 * política de la respuesta: Next lo lee de ahí para firmar sus propios scripts,
 * y los componentes de servidor lo leen con `headers()` para cualquier etiqueta
 * que necesiten emitir. Un nonce distinto entre la política y la etiqueta no da
 * error visible: simplemente el script no se ejecuta, y la página se queda a
 * medias sin explicar por qué.
 */
export const middleware = (peticion: NextRequest): NextResponse => {
  const nonce = generarNonce();
  const csp = construirCsp({
    nonce,
    desarrollo: process.env.NODE_ENV !== 'production',
    origenApi: process.env.API_URL,
    origenVideo: process.env.PUENTE_VIDEO_URL,
  });

  const cabeceras = new Headers(peticion.headers);
  cabeceras.set('x-nonce', nonce);
  cabeceras.set('content-security-policy', csp);

  const respuesta = NextResponse.next({ request: { headers: cabeceras } });
  respuesta.headers.set('content-security-policy', csp);
  return respuesta;
};

export const config = {
  // Los estáticos no llevan política: no ejecutan nada y añadir la cabecera a
  // cada icono solo engorda la respuesta.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|iconos/|sw.js|manifest.webmanifest).*)'],
};

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { construirCsp, generarNonce, peticionLlegoPorHttps } from './middleware-csp';

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
  /**
   * El esquema REAL de la petición, sellado para el resto del proceso.
   *
   * Lo calcula el middleware porque es el único punto que ve la petición
   * entera; los manejadores de ruta sólo alcanzan las cabeceras, y ahí no hay
   * protocolo. Con esta marca, **la CSP y la cookie de sesión deciden con el
   * mismo dato** en vez de con `NODE_ENV`, que es lo que produjo D-67 y D-68.
   *
   * Se reescribe siempre, nunca se propaga la que venga de fuera: si un cliente
   * la enviara, estaría decidiendo el atributo `Secure` de su propia cookie.
   */
  const seguro = peticionLlegoPorHttps(
    peticion.headers.get('x-forwarded-proto'),
    peticion.nextUrl.protocol,
  );

  const csp = construirCsp({
    nonce,
    desarrollo: process.env.NODE_ENV !== 'production',
    origenApi: process.env.API_URL,
    origenVideo: process.env.PUENTE_VIDEO_URL,
    // El origen del bucket es el de Supabase: la evidencia se sirve desde ahí.
    origenEvidencia: process.env.SUPABASE_URL,
    /**
     * Del esquema de ESTA petición, no del modo de compilación. Con el proxy
     * delante, el esquema real lo dice `x-forwarded-proto`: `nextUrl.protocol`
     * vería el `http` del salto interno y quitaría la directiva en un
     * despliegue que sí es HTTPS.
     */
    peticionSegura: seguro,
  });

  const cabeceras = new Headers(peticion.headers);
  cabeceras.set('x-nonce', nonce);
  cabeceras.set('x-ncr-esquema-seguro', seguro ? '1' : '0');
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

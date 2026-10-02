import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { construirCsp, generarNonce, peticionLlegoPorHttps } from './middleware-csp';
import { renovarSiHaceFalta } from './lib/sesion/renovar-en-middleware';

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
export const middleware = async (peticion: NextRequest): Promise<NextResponse> => {
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

  /**
   * 15-P · 0.3 · la renovación de una NAVEGACIÓN, aquí y no al pintar: los
   * componentes de servidor no pueden escribir cookies. Se deja el token nuevo
   * también en la PETICIÓN, para que esta misma página lo lea. `/api/*` renueva
   * en su manejador, que sí puede escribir.
   */
  const renovacion = peticion.nextUrl.pathname.startsWith('/api/')
    ? ({ tipo: 'nada' } as const)
    : await renovarSiHaceFalta(peticion, seguro);
  if (renovacion.tipo === 'renovada') {
    for (const c of renovacion.cookies) peticion.cookies.set(c.nombre, c.valor);
  } else if (renovacion.tipo === 'revocada') {
    for (const nombre of renovacion.borrar) peticion.cookies.delete(nombre);
  }

  const cabeceras = new Headers(peticion.headers);
  cabeceras.set('x-nonce', nonce);
  cabeceras.set('x-ncr-esquema-seguro', seguro ? '1' : '0');
  cabeceras.set('content-security-policy', csp);

  const respuesta = NextResponse.next({ request: { headers: cabeceras } });
  respuesta.headers.set('content-security-policy', csp);
  if (renovacion.tipo === 'renovada') {
    for (const c of renovacion.cookies) respuesta.cookies.set(c.nombre, c.valor, c.opciones);
  } else if (renovacion.tipo === 'revocada') {
    for (const nombre of renovacion.borrar) respuesta.cookies.delete(nombre);
  }
  return respuesta;
};

export const config = {
  // 15-P · 0.3 · Node y no Edge: la renovación usa el cliente de Supabase de la
  // consola, que es de servidor (`node:crypto`). Estable desde Next 15.5.
  runtime: 'nodejs',
  // Los estáticos no llevan política: no ejecutan nada y añadir la cabecera a
  // cada icono solo engorda la respuesta.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|iconos/|sw.js|manifest.webmanifest).*)'],
};

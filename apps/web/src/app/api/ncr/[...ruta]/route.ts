import { NextResponse } from 'next/server';
import { registrar } from '@/lib/registro';
import type { NextRequest } from 'next/server';
import { configuracion } from '@/lib/configuracion';
import { tokenVigente } from '@/lib/sesion/token';

/**
 * Proxy de la consola hacia la API (patrón BFF).
 *
 * **Por qué existe.** El token de sesión vive en una cookie `httpOnly`, así que
 * el navegador no puede ponerlo en una cabecera aunque quiera. Alguien tiene
 * que hacerlo, y ese alguien es este manejador, que corre en el servidor. A
 * cambio se gana lo que se buscaba: ningún script de la página puede leer el
 * token, y un XSS deja de ser un robo de sesión.
 *
 * **Lo que este proxy NO hace, a propósito:**
 *
 *  - No decide nada. No filtra por rol, no reinterpreta respuestas, no
 *    convierte códigos. La API es la autoridad; esto es transporte. Añadir
 *    aquí una comprobación de permisos crearía una segunda política que se
 *    desincronizaría de la del backend en la primera etapa siguiente.
 *  - No cachea. Ni las respuestas ni, sobre todo, las URL firmadas de
 *    evidencia: son de vida corta por diseño (RN-21) y cachearlas alargaría su
 *    vida útil justamente donde no se controla quién las lee.
 *
 * El 404 que devuelve la API ante un recurso de otra copropiedad viaja tal cual
 * (§ Aislamiento): traducirlo a 403 aquí reintroduciría la fuga que el backend
 * evita a propósito.
 */

// Sin caché en ningún nivel: es una pasarela autenticada.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Cabeceras del cliente que se dejan pasar. Lista blanca, no lista negra. */
const DEL_CLIENTE = new Set(['accept', 'content-type', 'x-request-id']);

/**
 * Cabeceras de la API que vuelven al navegador. También lista blanca: la de la
 * API puede crecer con datos internos —trazas, versiones— que no tienen por qué
 * llegar a la página.
 */
const DE_LA_API = new Set([
  'content-type',
  'content-disposition',
  'cache-control',
  'x-request-id',
  'retry-after',
  'x-ncr-truncado',
]);

const sinSesion = (): NextResponse =>
  NextResponse.json(
    { estado: 401, correlacion: 'sin-sesion', mensaje: 'Sesión no iniciada o expirada' },
    { status: 401 },
  );

const reenviar = async (peticion: NextRequest, segmentos: string[]): Promise<Response> => {
  const token = await tokenVigente();
  if (token === null) return sinSesion();

  const { apiUrl } = configuracion();
  const destino = new URL(`${apiUrl}/${segmentos.map(encodeURIComponent).join('/')}`);
  peticion.nextUrl.searchParams.forEach((valor, clave) => {
    destino.searchParams.append(clave, valor);
  });

  const cabeceras = new Headers();
  peticion.headers.forEach((valor, clave) => {
    if (DEL_CLIENTE.has(clave.toLowerCase())) cabeceras.set(clave, valor);
  });
  cabeceras.set('authorization', `Bearer ${token.accessToken}`);

  const cuerpo =
    peticion.method === 'GET' || peticion.method === 'HEAD' ? undefined : peticion.body;

  let respuesta: Response;
  try {
    respuesta = await fetch(destino, {
      method: peticion.method,
      headers: cabeceras,
      body: cuerpo,
      // Necesario en Node para enviar un cuerpo de flujo sin bufferizarlo.
      ...(cuerpo === undefined ? {} : { duplex: 'half' }),
      cache: 'no-store',
      signal: peticion.signal,
    } as RequestInit);
  } catch (e) {
    /**
     * La API caída no es un error de la consola: se distingue con un 503 para
     * que la interfaz muestre «sin conexión» y no «algo salió mal».
     *
     * **Y se registra con la ruta y la causa.** Un `503` mudo aquí costó una
     * ronda entera: `POST /api/ncr/auth/mfa/codigos` fallaba, parecía una ruta
     * inexistente del BFF y era la API que no estaba levantada —o que no
     * arranca por configuración incompleta, §2.7.1—. La ruta se registra; el
     * token y el cuerpo, nunca.
     */
    registrar('error', 'la API no responde', {
      ruta: `/${segmentos.join('/')}`,
      metodo: peticion.method,
      causa: e instanceof Error ? e.name : typeof e,
    });
    return NextResponse.json(
      {
        estado: 503,
        correlacion: 'api-inalcanzable',
        mensaje:
          'La API de Next Control no responde. Comprueba que está levantada y que API_URL apunta a ella.',
      },
      { status: 503 },
    );
  }

  const salida = new Headers();
  respuesta.headers.forEach((valor, clave) => {
    if (DE_LA_API.has(clave.toLowerCase())) salida.set(clave, valor);
  });
  salida.set('cache-control', 'no-store');

  // El cuerpo se devuelve como FLUJO y no se lee entero: es lo que permite que
  // `…/eventos/flujo` (SSE) pase por aquí y siga siendo un flujo. Bufferizarlo
  // convertiría el canal en vivo en una petición que no termina nunca.
  return new Response(respuesta.body, { status: respuesta.status, headers: salida });
};

const manejar = async (
  peticion: NextRequest,
  contexto: { params: Promise<{ ruta: string[] }> },
): Promise<Response> => {
  const { ruta } = await contexto.params;
  return reenviar(peticion, ruta);
};

export const GET = manejar;
export const POST = manejar;
export const PATCH = manejar;
export const DELETE = manejar;

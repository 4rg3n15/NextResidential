import createClient from 'openapi-fetch';
import type { paths } from '@ncr/contracts';

/**
 * Cliente HTTP de la consola, **tipado desde el contrato** (§2.6).
 *
 * `openapi-fetch` no genera código: toma los tipos que `openapi-typescript`
 * produjo desde `openapi.json` y los aplica sobre `fetch`. La consecuencia es
 * la que importa: una ruta que no existe, un parámetro que sobra o un campo que
 * la API dejó de devolver **no compilan**. Antes de la ETAPA 09 todas las
 * respuestas eran `unknown` y cualquier acceso compilaba.
 *
 * `baseUrl` apunta al PROPIO origen, no a la API. Todas las llamadas pasan por
 * `/api/ncr/…`, que es el proxy que añade el token desde la cookie `httpOnly`.
 * Por eso este módulo no conoce ninguna credencial ni ninguna URL de Supabase:
 * no hay nada que se le pueda escapar al navegador.
 */
export const cliente = createClient<paths>({
  baseUrl: '/api/ncr',
  // Las cookies de sesión son de primera parte y `httpOnly`; sin esto el
  // navegador no las enviaría en una petición hecha desde JavaScript.
  credentials: 'same-origin',
  headers: { Accept: 'application/json' },
});

/**
 * Error de la API ya interpretado.
 *
 * `estado` se conserva porque la interfaz decide con él: 401 lleva al acceso,
 * 403 muestra «sin permiso», 404 muestra «no encontrado» —que en este sistema
 * es también lo que devuelve un recurso de otra copropiedad, a propósito— y 503
 * muestra «sin conexión».
 */
export class ErrorDeApi extends Error {
  constructor(
    readonly estado: number,
    mensaje: string,
    readonly correlacion?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDeApi';
  }
}

interface CuerpoDeError {
  estado?: number;
  correlacion?: string;
  mensaje?: unknown;
}

/** Extrae un texto legible del cuerpo de error, sea cadena, arreglo u objeto. */
export const textoDelError = (cuerpo: unknown): string => {
  if (typeof cuerpo !== 'object' || cuerpo === null) return 'Error inesperado';
  const mensaje = (cuerpo as CuerpoDeError).mensaje;
  if (typeof mensaje === 'string') return mensaje;
  if (typeof mensaje === 'object' && mensaje !== null) {
    const interno = (mensaje as { message?: unknown }).message;
    if (typeof interno === 'string') return interno;
    if (Array.isArray(interno)) return interno.filter((x) => typeof x === 'string').join('. ');
  }
  return 'Error inesperado';
};

/**
 * Desenvuelve una respuesta de `openapi-fetch`: devuelve los datos o lanza un
 * `ErrorDeApi`. Existe para que las consultas no repitan el mismo `if (error)`
 * y, sobre todo, para que **nunca** devuelvan `undefined` como si fuera un
 * resultado válido — que es la forma silenciosa de pintar una tabla vacía
 * cuando en realidad hubo un 500.
 */
export const desenvolver = <T>(respuesta: {
  data?: T | undefined;
  error?: unknown;
  response: Response;
}): T => {
  if (respuesta.error !== undefined) {
    const cuerpo = respuesta.error as CuerpoDeError;
    throw new ErrorDeApi(
      cuerpo.estado ?? respuesta.response.status,
      textoDelError(respuesta.error),
      cuerpo.correlacion,
    );
  }
  if (respuesta.data === undefined) {
    throw new ErrorDeApi(respuesta.response.status, 'La API respondió sin cuerpo');
  }
  return respuesta.data;
};

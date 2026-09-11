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
  /**
   * `fetch` se resuelve en CADA llamada, no al crear el cliente.
   *
   * `openapi-fetch` guarda la referencia que encuentre al construirse, y eso
   * ata el cliente al `fetch` que existía en ese instante. En producción da
   * igual; en las pruebas significaba que las siete pantallas **no se podían
   * montar con un servidor falso**: el cliente seguía llamando al `fetch` real
   * y salía a la red. Una capa de red que no se puede sustituir es una capa
   * que no se puede probar, y eso ya es un defecto de diseño.
   */
  fetch: (peticion) => globalThis.fetch(peticion),
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
    /**
     * Rechazos por campo de un 422. Existe para que un formulario pueda poner
     * cada motivo debajo de SU campo: un «no se pudo guardar» encima del
     * formulario obliga a adivinar cuál de los cinco falló.
     */
    readonly porCampo?: Readonly<Record<string, string>>,
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

/**
 * Extrae los rechazos por campo de un 422, si los trae.
 *
 * Van dentro de `mensaje` porque el filtro global de la API envuelve **todo**
 * error en `{ estado, correlacion, mensaje }` y `mensaje` es la respuesta de la
 * excepción. Leerlos del nivel superior es el error fácil: es lo que la suite
 * de la API devolvía antes de registrar el mismo filtro que producción.
 */
export const rechazosPorCampo = (cuerpo: unknown): Record<string, string> | undefined => {
  if (typeof cuerpo !== 'object' || cuerpo === null) return undefined;
  const mensaje = (cuerpo as CuerpoDeError).mensaje;
  if (typeof mensaje !== 'object' || mensaje === null) return undefined;
  const lista = (mensaje as { rechazos?: unknown }).rechazos;
  if (!Array.isArray(lista)) return undefined;
  const salida: Record<string, string> = {};
  for (const entrada of lista) {
    if (typeof entrada !== 'object' || entrada === null) continue;
    const { clave, motivo } = entrada as { clave?: unknown; motivo?: unknown };
    if (typeof clave === 'string' && typeof motivo === 'string') salida[clave] = motivo;
  }
  return Object.keys(salida).length > 0 ? salida : undefined;
};

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
      rechazosPorCampo(respuesta.error),
    );
  }
  if (respuesta.data === undefined) {
    throw new ErrorDeApi(respuesta.response.status, 'La API respondió sin cuerpo');
  }
  return respuesta.data;
};

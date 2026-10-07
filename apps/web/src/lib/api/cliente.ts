import createClient from 'openapi-fetch';
import type { paths } from '@ncr/contracts';
import { escrituraRetenida } from '../cambio-de-copropiedad';

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
   * montar con un servidor falso**: el cliente seguía llamando al `fetch` real.
   */
  // E1 (15-R) · H-15K-01: mientras cambia la copropiedad, ninguna escritura sale.
  fetch: async (peticion) => escrituraRetenida(peticion) ?? globalThis.fetch(peticion),
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
 * es también lo que devuelve un recurso de otra copropiedad, a propósito—, 502
 * «la API no responde» (el proxy no la alcanzó) y 503 el motivo con que la API
 * dice que no está disponible (otros fallos, 15-M: antes 503 era las dos cosas).
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
    /**
     * 15-O · el código con que la API nombra la causa, si lo trae
     * (`BASE_DE_DATOS_NO_DISPONIBLE`): un 503 por la base no es «la API
     * caída», y la pantalla lo dice con su nombre.
     */
    readonly causa?: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDeApi';
  }
}

/** 15-O · el código que la API pone cuando perdió la conexión con PostgreSQL. */
export const CAUSA_BASE_DE_DATOS_NO_DISPONIBLE = 'BASE_DE_DATOS_NO_DISPONIBLE';

/** El `codigo` de máquina del cuerpo de error, si lo trae. */
export const causaDelError = (cuerpo: unknown): string | undefined => {
  if (typeof cuerpo !== 'object' || cuerpo === null) return undefined;
  const mensaje = (cuerpo as CuerpoDeError).mensaje;
  if (typeof mensaje !== 'object' || mensaje === null) return undefined;
  const codigo = (mensaje as { codigo?: unknown }).codigo;
  return typeof codigo === 'string' ? codigo : undefined;
};

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
    if (typeof clave === 'string' && typeof motivo === 'string') {
      salida[clave] = sinCodigosDelProyecto(motivo);
    }
  }
  return Object.keys(salida).length > 0 ? salida : undefined;
};

const CODIGO = String.raw`(?:RN|KPI|KP1|CA|HU|CU|OE|D|P|S|C|E|H-SITIO|BE)-?\d{1,3}[a-z]?`;
const CODIGOS_ENTRE_PARENTESIS = new RegExp(String.raw`\s*\((?:\s*${CODIGO}\s*,?)+\)`, 'g');
const CODIGO_DE_ENTRADA = new RegExp(String.raw`^\s*${CODIGO}\s*·\s*`);

/**
 * BLOQUE I (15-L) · la API explica sus rechazos citando la regla que los
 * produce —«Dele de baja en vez de borrarla (RN-19)», «D-11 · …»—, útil en
 * su registro y ajeno a quien usa la consola. Aquí se quitan esas citas del
 * texto que se va a pintar; el mensaje, lo que la persona necesita, queda.
 */
export const sinCodigosDelProyecto = (texto: string): string =>
  texto.replace(CODIGOS_ENTRE_PARENTESIS, '').replace(CODIGO_DE_ENTRADA, '').trim();

/** Extrae un texto legible del cuerpo de error, sea cadena, arreglo u objeto. */
export const textoDelError = (cuerpo: unknown): string => {
  if (typeof cuerpo !== 'object' || cuerpo === null) return 'Error inesperado';
  const mensaje = (cuerpo as CuerpoDeError).mensaje;
  if (typeof mensaje === 'string') return sinCodigosDelProyecto(mensaje);
  if (typeof mensaje === 'object' && mensaje !== null) {
    const interno = (mensaje as { message?: unknown }).message;
    if (typeof interno === 'string') return sinCodigosDelProyecto(interno);
    if (Array.isArray(interno)) {
      return interno
        .filter((x): x is string => typeof x === 'string')
        .map(sinCodigosDelProyecto)
        .join('. ');
    }
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
      causaDelError(respuesta.error),
    );
  }
  if (respuesta.data === undefined) {
    throw new ErrorDeApi(respuesta.response.status, 'La API respondió sin cuerpo');
  }
  return respuesta.data;
};

/**
 * 15-W · el fallo de una consulta, en una línea, para los controles que viven
 * DENTRO de una pantalla (un desplegable, un tope) y no la ocupan entera.
 *
 * Si la API contestó, su mensaje —ya sin códigos—: un 403 dice «Rol no
 * autorizado», no «algo salió mal». Si ni siquiera hubo respuesta, `fetch`
 * rechaza con un `TypeError` en inglés que no le dice nada a quien usa la
 * consola: eso es «sin conexión», el mismo estado que `estadoSegunCodigo`
 * pinta a pantalla completa.
 */
export const mensajeDeFallo = (error: unknown): string =>
  error instanceof ErrorDeApi ? error.message : 'Sin conexión con el servidor.';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D1 (15-S1) · UNA CANCELACIÓN DEL NAVEGADOR NO ES UNA EXCEPCIÓN NO CAPTURADA
 *
 * En sitio (06/10), cada vez que el operador cambiaba de equipo con el video
 * negociándose, la consola imprimía «⨯ uncaughtException: [Error: aborted]
 * { code: 'ECONNRESET' }». El navegador cancela el `POST …/whep` —es lo
 * correcto— y Node destruye la petición entrante con ese error.
 *
 * Por qué llega como «no capturada» (réplica con la función real de Next en
 * `src/lib/cancelaciones-del-cliente.test.ts`): con el middleware en runtime
 * `nodejs`, Next 15 clona el cuerpo (`getCloneableBody`) y, al terminar el
 * middleware, SUSTITUYE las tripas del `IncomingMessage` por las de un
 * `PassThrough` (`replaceRequestBody`). El `IncomingMessage` sólo emite
 * 'error' si alguien escucha; el `PassThrough`, siempre. Leído ya el cuerpo,
 * nadie escucha, y un oyente puesto aquí antes de Next se pierde con la
 * sustitución: el `destroy('aborted')` de Node acaba en el manejador de
 * proceso de Next, que lo imprime como si fuera un fallo.
 *
 * No se toca Next ni el middleware. Se filtra ESA firma —`aborted` con
 * `ECONNRESET`, la de `connResetException` con que Node aborta una petición
 * entrante— delante de los manejadores que ya hubiera; todo lo demás les
 * llega intacto y en el mismo orden.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** La firma con que Node destruye una petición que el cliente abandonó. */
export const esCancelacionDelCliente = (error) =>
  error instanceof Error &&
  error.message === 'aborted' &&
  /** @type {{ code?: unknown }} */ (error).code === 'ECONNRESET';

/**
 * Pone el filtro delante de los oyentes de 'uncaughtException' que haya. Se
 * llama DESPUÉS de `app.prepare()`: ahí registra Next los suyos. Sin oyentes
 * previos no hace nada: sin ellos, Node termina el proceso ante un fallo de
 * verdad, y un filtro que lo tragara en silencio sería peor que el ruido.
 *
 * @returns {boolean} si quedó puesto.
 */
export const filtrarCancelacionesDelCliente = (proceso = process) => {
  const anteriores = proceso.listeners('uncaughtException');
  if (anteriores.length === 0) return false;
  proceso.removeAllListeners('uncaughtException');
  proceso.on('uncaughtException', (error, origen) => {
    if (esCancelacionDelCliente(error)) return;
    for (const oyente of anteriores) oyente.call(proceso, error, origen);
  });
  return true;
};

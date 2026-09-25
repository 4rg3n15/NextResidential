/**
 * Marca para un error PROPIO cuyo mensaje sí puede salir al cliente con un 4xx.
 *
 * El filtro global normaliza a «Petición rechazada» todo 4xx que no sea una
 * `HttpException` (H-13-12): el texto de una dependencia —«request entity too
 * large», de `body-parser`— no debe salir. Pero hay errores nuestros, de
 * infraestructura, cuyo texto ES la respuesta: una regla de la base que se
 * negó nombra la RN, y eso es lo que el operador necesita leer.
 *
 * Se marca con un símbolo y no con `expose` de `http-errors` a propósito:
 * `body-parser` también pone `expose: true`, y adoptarlo habría vuelto a
 * filtrar su texto. Sólo lo que lleva ESTA marca, que sólo pone código
 * nuestro, sale tal cual.
 */
export const EXPONE_MENSAJE = Symbol.for('ncr.error.exponeMensaje');

export const mensajeExpuesto = (error: unknown): string | undefined =>
  error instanceof Error && (error as unknown as Record<symbol, unknown>)[EXPONE_MENSAJE] === true
    ? error.message
    : undefined;

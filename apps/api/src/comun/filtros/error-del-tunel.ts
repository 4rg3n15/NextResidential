/**
 * 15-Q2 · C3 · el Edge del conjunto no está conectado, o no contestó a tiempo.
 *
 * No es un fallo del programa (500) ni de quien pide (4xx): es una dependencia
 * que falta, como la base caída. 503 con un CÓDIGO que la consola reconoce y el
 * motivo, que es nuestro y no lleva nada interno («el Edge del conjunto no está
 * conectado»). Por NOMBRE: el filtro no depende de las clases del túnel.
 */
const DEL_TUNEL: ReadonlyMap<string, string> = new Map([
  ['EdgeDesconectado', 'el Edge del conjunto no está conectado'],
  ['OrdenVencida', 'el Edge del conjunto no contestó a tiempo'],
]);

export const CODIGO_EDGE_NO_DISPONIBLE = 'EDGE_NO_DISPONIBLE';

export const motivoDelTunel = (
  error: unknown,
): { readonly codigo: string; readonly message: string } | null =>
  error instanceof Error && DEL_TUNEL.has(error.name)
    ? // El texto es FIJO: el del error nombra el pedido interno o trae el motivo
      // de cierre que eligió el otro lado, y nada de eso es para la consola.
      { codigo: CODIGO_EDGE_NO_DISPONIBLE, message: DEL_TUNEL.get(error.name) as string }
    : null;

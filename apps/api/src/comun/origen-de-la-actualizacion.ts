import type { IncomingMessage } from 'node:http';

/**
 * 15-R · D2 · el `Origin` de una actualización a WebSocket. Un WebSocket NO
 * pasa por CORS: cualquier página puede intentarlo. Con el audio directo del
 * navegador a la API (P-20), un `Origin` que no esté en `CORS_ALLOWED_ORIGINS`
 * se rechaza aunque traiga billete. Sin `Origin` (el reenvío de `servidor.mjs`
 * en sitio, el Edge) no hay página que suplantar: pasa, y decide el billete.
 */
export const origenAdmitido = (
  peticion: Pick<IncomingMessage, 'headers'>,
  permitidos: readonly string[],
): boolean => {
  const origen = peticion.headers.origin;
  return origen === undefined || permitidos.includes(origen);
};

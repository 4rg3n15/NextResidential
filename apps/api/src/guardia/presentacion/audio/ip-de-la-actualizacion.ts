import type { IncomingMessage } from 'node:http';

/**
 * 15-P · la IP del navegador en una petición de ACTUALIZACIÓN a WebSocket.
 *
 * La actualización no pasa por Express, así que `req.ip` no existe. Se calcula
 * igual que lo hace Express con el `trust proxy` acotado (H6): se recorre la
 * cadena desde el socket y se salta cada salto en el que se confía. Con la
 * consola delante (su servidor reenvía y escribe `X-Forwarded-For` con la IP
 * del navegador), sale la del navegador; sin proxy de confianza, la del socket.
 * Así el billete —emitido con `req.ip`— se compara con la MISMA IP.
 */
export type ConfianzaDeProxy = (direccion: string, salto: number) => boolean;

export const ipDeLaActualizacion = (
  peticion: Pick<IncomingMessage, 'headers' | 'socket'>,
  confia: ConfianzaDeProxy,
): string | null => {
  const reenviadas = peticion.headers['x-forwarded-for'];
  const cadena = (Array.isArray(reenviadas) ? reenviadas.join(',') : (reenviadas ?? ''))
    .split(',')
    .map((d) => d.trim())
    .filter((d) => d !== '')
    .reverse();
  const direcciones = [peticion.socket.remoteAddress ?? '', ...cadena];
  let i = 0;
  while (i < direcciones.length - 1 && confia(direcciones[i] ?? '', i)) i += 1;
  const ip = direcciones[i] ?? '';
  return ip === '' ? null : ip;
};

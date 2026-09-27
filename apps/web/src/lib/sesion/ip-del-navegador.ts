import 'server-only';
import { headers } from 'next/headers';
import { reenvioDeIp } from '../ip-de-la-peticion';

/**
 * H6 (15-L) · la IP del navegador de la petición EN CURSO, para reenviarla a la
 * API desde un componente de servidor. La API evalúa la regla de IP del
 * portero en CADA petición (H4): sin esto, lo que la consola pide al pintar
 * una página le llegaría desde 127.0.0.1 y el portero quedaría fuera.
 */
export const reenvioDeIpActual = async (): Promise<Record<string, string>> => {
  try {
    return reenvioDeIp(await headers());
  } catch {
    // Fuera de una petición (no debería ocurrir): sin cabecera, la API ve el socket.
    return {};
  }
};

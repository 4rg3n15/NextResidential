import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · UN SOLO DUEÑO DEL `upgrade` DEL SERVIDOR HTTP
 *
 * Hasta la 15-Q2 había un WebSocket (el audio de la guardia) y su puerta se
 * colgaba del evento `upgrade` y respondía 404 a todo lo demás. Con un segundo
 * WebSocket (el túnel del Edge) eso es una carrera: dos oyentes del mismo
 * evento, y el primero DESTRUYE el socket del otro. Aquí hay uno solo, que
 * reparte por RUTA exacta; lo que no tiene dueño recibe 404 y se cierra, como
 * antes. Una ruta repetida es un error de cableado y se lanza al arrancar.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type ManejadorDeActualizacion = (
  peticion: IncomingMessage,
  socket: Duplex,
  cabeza: Buffer,
  url: URL,
) => void;

const rutasPorServidor = new WeakMap<Server, Map<string, ManejadorDeActualizacion>>();

export const rechazarActualizacion = (socket: Duplex, estado: string): void => {
  socket.write(`HTTP/1.1 ${estado}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
};

/** Registra `ruta` en el servidor. Devuelve cómo darla de baja (cierre ordenado). */
export const atenderActualizacion = (
  servidor: Server,
  ruta: string,
  manejador: ManejadorDeActualizacion,
): (() => void) => {
  let rutas = rutasPorServidor.get(servidor);
  if (rutas === undefined) {
    const nuevas = new Map<string, ManejadorDeActualizacion>();
    rutas = nuevas;
    rutasPorServidor.set(servidor, nuevas);
    servidor.on('upgrade', (peticion: IncomingMessage, socket: Duplex, cabeza: Buffer) => {
      const url = new URL(peticion.url ?? '/', 'http://api');
      const dueno = nuevas.get(url.pathname);
      if (dueno === undefined) rechazarActualizacion(socket, '404 Not Found');
      else dueno(peticion, socket, cabeza, url);
    });
  }
  if (rutas.has(ruta)) throw new Error(`la ruta de WebSocket «${ruta}» ya tiene dueño`);
  rutas.set(ruta, manejador);
  return () => void rutas.delete(ruta);
};

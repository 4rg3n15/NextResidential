/**
 * 15-Q2 · el `WebSocket` estándar (el global de Node 22) como `Enlace` de la
 * sesión del túnel. Lo mínimo del socket se declara aquí (`SocketWeb`) para que
 * las pruebas puedan darle uno propio sin red.
 */
import type { Enlace } from '@ncr/providers';

export interface SocketWeb {
  binaryType: string;
  readonly readyState: number;
  onopen: (() => void) | null;
  onmessage: ((evento: { readonly data: unknown }) => void) | null;
  onclose: ((evento: { readonly code: number; readonly reason: string }) => void) | null;
  onerror: (() => void) | null;
  send(dato: string | Uint8Array): void;
  close(codigo?: number, motivo?: string): void;
}

const ABIERTO = 1;

export interface EnlaceWebSocket extends Enlace {
  alAbrir(manejador: () => void): void;
  alCerrar(manejador: (motivo: string, codigo: number) => void): void;
}

export const enlaceWebSocket = (socket: SocketWeb): EnlaceWebSocket => {
  socket.binaryType = 'arraybuffer';
  let alRecibir: ((dato: string | Uint8Array) => void) | null = null;
  const alCerrar: ((motivo: string, codigo: number) => void)[] = [];
  let cerrado = false;

  socket.onmessage = (evento) => {
    const { data } = evento;
    const dato =
      typeof data === 'string'
        ? data
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data as Uint8Array);
    alRecibir?.(dato);
  };
  socket.onclose = (evento) => {
    if (cerrado) return;
    cerrado = true;
    for (const m of alCerrar) m(evento.reason || `cerrado (${String(evento.code)})`, evento.code);
  };
  // El error de un WebSocket siempre viene seguido de su `close`: allí se decide.
  socket.onerror = () => undefined;

  return {
    enviar: (dato) => {
      if (socket.readyState === ABIERTO) socket.send(dato);
    },
    cerrar: (codigo, motivo) => socket.close(codigo, motivo.slice(0, 120)),
    alRecibir: (m) => {
      alRecibir = m;
    },
    alCerrar: (m) => void alCerrar.push(m),
    alAbrir: (m) => {
      socket.onopen = m;
    },
  };
};

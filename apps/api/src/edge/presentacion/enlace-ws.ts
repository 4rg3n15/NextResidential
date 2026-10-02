import type { RawData, WebSocket } from 'ws';
import type { Enlace } from '@ncr/providers';

/**
 * 15-Q2 · un WebSocket de `ws` como `Enlace` de la sesión del túnel.
 *
 * Retiene lo que llega hasta que haya quien lo atienda: el primer mensaje (el
 * `hola`) se lee con `primero()` mientras la aplicación acredita al Edge, y lo
 * que llegue en ese intervalo no se pierde, espera a la sesión.
 */
export interface EnlaceWs extends Enlace {
  primero(plazoMs: number): Promise<string | Uint8Array | null>;
}

const aBytes = (dato: RawData): Uint8Array =>
  Array.isArray(dato)
    ? new Uint8Array(Buffer.concat(dato))
    : new Uint8Array(Buffer.isBuffer(dato) ? dato : Buffer.from(dato));

export const enlaceWs = (ws: WebSocket): EnlaceWs => {
  const retenidos: (string | Uint8Array)[] = [];
  let manejador: ((dato: string | Uint8Array) => void) | null = null;
  let esperando: ((dato: string | Uint8Array) => void) | null = null;

  ws.on('message', (dato: RawData, binario: boolean) => {
    const recibido = binario ? aBytes(dato) : Buffer.from(aBytes(dato)).toString('utf8');
    if (esperando !== null) {
      const entregar = esperando;
      esperando = null;
      entregar(recibido);
    } else if (manejador !== null) manejador(recibido);
    else retenidos.push(recibido);
  });
  ws.on('error', () => ws.terminate());

  return {
    enviar: (dato) => {
      if (ws.readyState === ws.OPEN) ws.send(dato, { binary: typeof dato !== 'string' });
    },
    cerrar: (codigo, motivo) => ws.close(codigo, motivo.slice(0, 120)),
    alRecibir: (m) => {
      manejador = m;
      for (const dato of retenidos.splice(0)) m(dato);
    },
    alCerrar: (m) => void ws.on('close', (codigo: number) => m(`cerrado (${String(codigo)})`)),
    primero: (plazoMs) =>
      new Promise((resolver) => {
        const ya = retenidos.shift();
        if (ya !== undefined) {
          resolver(ya);
          return;
        }
        const plazo = setTimeout(() => {
          esperando = null;
          resolver(null);
        }, plazoMs);
        esperando = (dato) => {
          clearTimeout(plazo);
          resolver(dato);
        };
      }),
  };
};

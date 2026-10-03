import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { enlaceWebSocket } from './enlace-websocket';
import type { SocketWeb } from './enlace-websocket';

/** Un puerto donde nadie escucha: se abre, se lee su número y se cierra. */
const puertoLibre = (): Promise<number> =>
  new Promise((listo) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      s.close(() => listo(port));
    });
  });

const cierre = (socket: SocketWeb) =>
  new Promise<{ motivo: string; codigo: number }>((listo) =>
    enlaceWebSocket(socket).alCerrar((motivo, codigo) => listo({ motivo, codigo })),
  );

const falso = (): SocketWeb => ({
  binaryType: '',
  readyState: 0,
  onopen: null,
  onmessage: null,
  onclose: null,
  onerror: null,
  send: () => undefined,
  close: () => undefined,
});

describe('enlaceWebSocket · el cierre llega SIEMPRE, aunque el socket no lo diga', () => {
  it('Node 22: una conexión rechazada emite `error` y nunca `close`; el enlace se cierra igual', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${String(await puertoLibre())}/edge/tunel`);
    expect(await cierre(socket as unknown as SocketWeb)).toEqual({
      motivo: 'error de conexión',
      codigo: 1006,
    });
  });

  it('si el `close` llega tras el `error`, gana su código: el backoff de identidad lo necesita', async () => {
    const socket = falso();
    const resultado = cierre(socket);
    socket.onerror?.();
    socket.onclose?.({ code: 4401, reason: 'Edge no acreditado' });
    expect(await resultado).toEqual({ motivo: 'Edge no acreditado', codigo: 4401 });
  });

  it('un solo aviso de cierre por enlace, por muchos eventos que lleguen', async () => {
    const socket = falso();
    const avisos: number[] = [];
    enlaceWebSocket(socket).alCerrar((_m, codigo) => avisos.push(codigo));
    socket.onclose?.({ code: 1000, reason: '' });
    socket.onerror?.();
    socket.onclose?.({ code: 1001, reason: '' });
    await new Promise((r) => setTimeout(r, 150));
    expect(avisos).toEqual([1000]);
  });
});

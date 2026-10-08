import { describe, expect, it, vi } from 'vitest';
import { CanalDeAudioPorWebSocket, UMBRAL_DE_VOZ, nivelDe } from './canal-por-websocket';
import type { EstadoDelCanalWs, NivelesDelCanal, OpcionesDelCanalWs } from './canal-por-websocket';

/**
 * B3 (15-S2) · manos libres, niveles en vivo y semidúplex, sin navegador: los
 * mismos falsos que `canal-por-websocket.test.ts`.
 */
class SocketFalso extends EventTarget {
  readyState = 0;
  binaryType = 'blob';
  readonly enviados: (string | Uint8Array)[] = [];
  cerradoCon: { codigo: number; motivo: string } | null = null;
  send(datos: string | Uint8Array): void {
    this.enviados.push(datos);
  }
  close(codigo: number, motivo: string): void {
    this.cerradoCon = { codigo, motivo };
    this.readyState = 3;
  }
  abrir(): void {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
  recibir(datos: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data: datos }));
  }
  cerrarDesdeElServidor(codigo: number, motivo = ''): void {
    this.readyState = 3;
    const evento = new Event('close') as Event & { code: number; reason: string };
    Object.assign(evento, { code: codigo, reason: motivo });
    this.dispatchEvent(evento);
  }
  textos(): unknown[] {
    return this.enviados.filter((e) => typeof e === 'string').map((e) => JSON.parse(e));
  }
  tramas(): Uint8Array[] {
    return this.enviados.filter((e): e is Uint8Array => typeof e !== 'string');
  }
}

const contextoFalso = () => {
  const procesadores: { onaudioprocess: ((e: unknown) => void) | null }[] = [];
  const programados: number[] = [];
  const nodo = () => ({ connect: () => undefined, disconnect: () => undefined });
  const contexto = {
    currentTime: 0,
    sampleRate: 8000,
    destination: {},
    createBuffer: (_c: number, largo: number, hz: number) => ({
      duration: largo / hz,
      copyToChannel: () => undefined,
    }),
    createBufferSource: () => {
      const fuente = { ...nodo(), buffer: null, start: (en: number) => programados.push(en) };
      return fuente;
    },
    createMediaStreamSource: nodo,
    createScriptProcessor: () => {
      const p = { ...nodo(), onaudioprocess: null as ((e: unknown) => void) | null };
      procesadores.push(p);
      return p;
    },
    createGain: () => ({ ...nodo(), gain: { value: 1 } }),
    close: vi.fn(async () => undefined),
  };
  /** Un bloque del micrófono: 320 muestras a 8 kHz = dos tramas de 160 B. */
  const hablar = (): void => {
    const p = procesadores.at(-1);
    p?.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(320).fill(0.2) } });
  };
  return { contexto: contexto as unknown as AudioContext, programados, procesadores, hablar };
};

const microfonoFalso = () => {
  const pistas = [{ stop: vi.fn() }];
  return { flujo: { getTracks: () => pistas } as unknown as MediaStream, pistas };
};

const montar = (
  obtenerMicrofono?: () => Promise<MediaStream>,
  extra: Partial<OpcionesDelCanalWs> = {},
) => {
  const socket = new SocketFalso();
  const audio = contextoFalso();
  const estados: EstadoDelCanalWs[] = [];
  const mic = microfonoFalso();
  const canal = new CanalDeAudioPorWebSocket({
    url: 'wss://consola/api/ncr-audio?billete=x',
    formato: 'g711u',
    alEstado: (e) => estados.push(e),
    crearSocket: () => socket as unknown as WebSocket,
    crearContexto: () => audio.contexto,
    obtenerMicrofono: obtenerMicrofono ?? (async () => mic.flujo),
    ...extra,
  });
  socket.abrir();
  return { canal, socket, audio, estados, mic };
};

describe('CanalDeAudioPorWebSocket · manos libres (B3)', () => {
  it('abre el micrófono con modo manos_libres y lo deja abierto; soltar lo cierra', async () => {
    const { canal, socket, audio, estados, mic } = montar();
    await canal.manosLibresActivas();
    expect(socket.textos()).toEqual([{ tipo: 'pulsar', modo: 'manos_libres' }]);
    expect(estados.at(-1)).toEqual({ fase: 'hablando', manosLibres: true });
    audio.hablar();
    expect(socket.tramas()).toHaveLength(2);
    // Pulsar el otro botón no lo convierte en «pulsar para hablar».
    await canal.pulsar();
    expect(socket.textos()).toHaveLength(2);
    canal.soltar();
    expect(mic.pistas[0]?.stop).toHaveBeenCalled();
  });

  it('la bajada se reproduce MIENTRAS se habla: no hay silencio de consola', async () => {
    const { canal, socket, audio } = montar();
    await canal.manosLibresActivas();
    audio.hablar();
    socket.recibir(new Uint8Array(160).fill(0x80).buffer);
    socket.recibir(new Uint8Array(160).fill(0x80).buffer);
    expect(audio.programados).toHaveLength(2);
  });

  it('«voz» a la API sólo con voz de verdad, y como mucho una vez por segundo', async () => {
    let ahora = 0;
    const { canal, socket, audio } = montar(undefined, { ahora: () => ahora });
    await canal.manosLibresActivas();
    audio.hablar();
    audio.hablar();
    ahora += 1000;
    audio.hablar();
    expect(socket.textos().filter((t) => (t as { tipo: string }).tipo === 'voz')).toHaveLength(2);
    expect(nivelDe(new Float32Array(320))).toBeLessThan(UMBRAL_DE_VOZ);
  });

  it('pulsar para hablar no manda «voz»: lo renueva el pulsar y el audio', async () => {
    const { canal, socket, audio } = montar();
    await canal.pulsar();
    audio.hablar();
    expect(socket.textos()).toEqual([{ tipo: 'pulsar' }]);
  });

  it('niveles en vivo de los dos sentidos, como mucho cuatro veces por segundo', async () => {
    let ahora = 1000;
    const niveles: NivelesDelCanal[] = [];
    const { canal, socket, audio } = montar(undefined, {
      ahora: () => ahora,
      alNiveles: (n) => niveles.push(n),
    });
    socket.recibir(new Uint8Array(160).fill(0x80).buffer);
    await canal.pulsar();
    ahora += 300;
    audio.hablar();
    audio.hablar();
    expect(niveles).toHaveLength(2);
    expect(niveles[1]?.enviando).toBeCloseTo(0.2, 1);
    expect(niveles[1]?.recibiendo).toBeGreaterThan(0.5);
  });

  it('«semiduplex» de la API llega a la consola', () => {
    const alSemiduplex = vi.fn();
    const { socket } = montar(undefined, { alSemiduplex });
    socket.recibir(JSON.stringify({ tipo: 'semiduplex' }));
    expect(alSemiduplex).toHaveBeenCalledTimes(1);
  });
});

// Sólo para que el tipo se use: los estados se comprueban arriba.
export type { EstadoDelCanalWs };

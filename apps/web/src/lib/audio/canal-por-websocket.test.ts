import { describe, expect, it, vi } from 'vitest';
import { CanalDeAudioPorWebSocket } from './canal-por-websocket';
import type { EstadoDelCanalWs } from './canal-por-websocket';

/**
 * 15-P · P5 · «pulsar para hablar» sin navegador: el socket, el micrófono y el
 * `AudioContext` son de mentira y dicen lo que pasó. Que SUENE se mide en el
 * banco (`e2e/medir-audio-guardia.mjs`) y en sitio.
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

const montar = (obtenerMicrofono?: () => Promise<MediaStream>) => {
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
  });
  socket.abrir();
  return { canal, socket, audio, estados, mic };
};

describe('CanalDeAudioPorWebSocket · pulsar para hablar', () => {
  it('escucha desde que abre, sin pulsar nada: cada trama del equipo se programa', () => {
    const { socket, audio, estados } = montar();
    expect(estados.map((e) => e.fase)).toEqual(['conectando', 'escuchando']);
    expect(socket.binaryType).toBe('arraybuffer');
    socket.recibir(new Uint8Array(160).fill(0xff).buffer);
    socket.recibir(new Uint8Array(160).fill(0xff).buffer);
    expect(audio.programados).toHaveLength(2);
    expect(audio.programados[1]).toBeCloseTo((audio.programados[0] ?? 0) + 0.02, 5);
  });

  it('pulsar avisa al servidor y transmite tramas de 160 B; soltar corta el micrófono', async () => {
    const { canal, socket, audio, estados, mic } = montar();
    await canal.pulsar();
    expect(estados.at(-1)?.fase).toBe('hablando');
    audio.hablar();
    expect(socket.textos()).toEqual([{ tipo: 'pulsar' }]);
    expect(socket.tramas().map((t) => t.length)).toEqual([160, 160]);
    canal.soltar();
    expect(socket.textos()).toEqual([{ tipo: 'pulsar' }, { tipo: 'soltar' }]);
    expect(mic.pistas[0]?.stop).toHaveBeenCalled();
    audio.hablar();
    expect(socket.tramas()).toHaveLength(2);
    expect(estados.at(-1)?.fase).toBe('escuchando');
  });

  it('soltar ANTES de que abra el micrófono: al abrir se cierra y no se transmite nada', async () => {
    let abrir: (f: MediaStream) => void = () => undefined;
    const mic = microfonoFalso();
    const { canal, socket, estados } = montar(
      () => new Promise<MediaStream>((listo) => (abrir = listo)),
    );
    const pulsado = canal.pulsar();
    canal.soltar();
    abrir(mic.flujo);
    await pulsado;
    expect(mic.pistas[0]?.stop).toHaveBeenCalled();
    expect(socket.enviados).toEqual([]);
    expect(estados.some((e) => e.fase === 'hablando')).toBe(false);
  });

  it('la autorrepetición del teclado no abre dos micrófonos', async () => {
    const obtener = vi.fn(async () => microfonoFalso().flujo);
    const { canal } = montar(obtener);
    await Promise.all([canal.pulsar(), canal.pulsar(), canal.pulsar()]);
    expect(obtener).toHaveBeenCalledTimes(1);
  });

  it('el servidor corta el tramo (caducidad): se deja de transmitir y se dice por qué', async () => {
    const { canal, socket, audio, estados } = montar();
    await canal.pulsar();
    socket.recibir(JSON.stringify({ tipo: 'cortado', motivo: 'El tramo superó los 60 s' }));
    audio.hablar();
    expect(socket.tramas()).toHaveLength(0);
    expect(estados.at(-1)).toEqual({ fase: 'escuchando', aviso: 'El tramo superó los 60 s' });
  });

  it('el servidor cierra por turno caducado: estado cerrado con el motivo en palabras', async () => {
    const { canal, socket, audio, estados } = montar();
    await canal.pulsar();
    socket.cerrarDesdeElServidor(4001);
    expect(estados.at(-1)).toEqual({ fase: 'cerrado', motivo: 'El turno caducó por inactividad' });
    expect(audio.contexto.close).toHaveBeenCalled();
    await canal.pulsar();
    expect(socket.textos()).toEqual([{ tipo: 'pulsar' }]);
  });

  it('colgar (cambio de equipo o pestaña cerrada) cierra el socket con 1000 y libera todo', async () => {
    const { canal, socket, estados, mic } = montar();
    await canal.pulsar();
    canal.cerrar();
    expect(socket.cerradoCon).toEqual({ codigo: 1000, motivo: 'El operador colgó' });
    expect(mic.pistas[0]?.stop).toHaveBeenCalled();
    expect(estados.at(-1)).toEqual({ fase: 'cerrado', motivo: 'Conversación terminada' });
  });

  it('un texto que no es del protocolo no cambia nada', () => {
    const { socket, estados } = montar();
    socket.recibir('no es json');
    socket.recibir(JSON.stringify({ tipo: 'otro' }));
    expect(estados.map((e) => e.fase)).toEqual(['conectando', 'escuchando']);
  });
});

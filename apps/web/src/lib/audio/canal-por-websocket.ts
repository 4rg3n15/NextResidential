import { HZ_DEL_CANAL, codificar, decodificar, remuestrear } from './g711';
import type { FormatoG711 } from './g711';
import { trocear } from './puente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P2 · EL AUDIO DE LA GUARDIA POR UN WEBSOCKET A LA API (ADR-01, enm. 15-P)
 *
 * Un solo canal ordenado y binario entre la consola y la API, por el MISMO
 * origen de la consola (`/api/ncr-audio`, que su servidor reenvía a la API):
 * la CSP no se toca y el navegador nunca habla con el equipo (RN-12, RN-21).
 *
 *  · Escucha desde que abre: cada mensaje binario son tramas G.711 del equipo,
 *    que se programan con un colchón corto y sin dejar que se acumule retraso.
 *  · Pulsar para hablar: el micrófono se abre al pulsar y se suelta al soltar
 *    —el navegador enseña su piloto sólo mientras tanto—, y las tramas salen de
 *    160 B (20 ms), una por mensaje. Si se suelta ANTES de que el micrófono
 *    abra, al abrir se cierra sin transmitir nada.
 *  · Lo que decide el servidor —turno caducado, tramo demasiado largo, sin la
 *    palabra— llega como cierre o como aviso, con el motivo en palabras.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const BYTES_POR_TRAMA = 160;
/** ~21 ms a 48 kHz: lo que tarda en llenarse cada bloque del micrófono. */
const MUESTRAS_POR_BLOQUE = 1024;
const COLCHON_S = 0.06;
/**
 * Más adelanto que esto es retraso acumulado (una ráfaga de la red que se
 * quedó en la cola): se vuelve al colchón. Medido en el banco (15-P): con
 * 0,4 s la vuelta se asentaba ~100 ms por encima de lo necesario.
 */
const ADELANTO_MAXIMO_S = 0.15;

export type EstadoDelCanalWs =
  | { readonly fase: 'conectando' }
  | { readonly fase: 'escuchando'; readonly aviso?: string }
  | { readonly fase: 'hablando'; readonly manosLibres?: boolean }
  | { readonly fase: 'cerrado'; readonly motivo: string };

/** B3 (15-S2) · lo que se ve en vivo: nivel 0…1 de cada sentido. */
export interface NivelesDelCanal {
  readonly recibiendo: number;
  readonly enviando: number;
}

/** RMS (0…1) de muestras en coma flotante: lo mismo para lo que llega y lo que sale. */
export const nivelDe = (muestras: Float32Array): number => {
  if (muestras.length === 0) return 0;
  let suma = 0;
  for (const m of muestras) suma += m * m;
  return Math.min(1, Math.sqrt(suma / muestras.length));
};

/** Por encima, el operador habla: en manos libres, eso renueva el turno («voz»). */
export const UMBRAL_DE_VOZ = 0.02;

export interface OpcionesDelCanalWs {
  readonly url: string;
  readonly formato: FormatoG711;
  readonly alEstado: (estado: EstadoDelCanalWs) => void;
  readonly crearSocket?: (url: string) => WebSocket;
  readonly crearContexto?: () => AudioContext;
  readonly obtenerMicrofono?: () => Promise<MediaStream>;
  /** B3 (15-S2) · niveles en vivo, unas cuatro veces por segundo. */
  readonly alNiveles?: (niveles: NivelesDelCanal) => void;
  /** B3 (15-S2) · la API midió que el equipo calla mientras recibe. */
  readonly alSemiduplex?: () => void;
  readonly ahora?: () => number;
}

/** Los cierres que decide el servidor, en palabras para el operador. */
const MOTIVOS: Readonly<Record<number, string>> = {
  1000: 'Conversación terminada',
  1006: 'Se perdió la conexión con la API',
  4001: 'El turno caducó por inactividad',
  4003: 'La palabra la tiene otro operador',
  4008: 'Demasiado audio en poco tiempo: la API cortó la conversación',
  4010: 'El equipo cerró el canal de audio',
};

const microfonoPorOmision = (): Promise<MediaStream> =>
  navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });

export class CanalDeAudioPorWebSocket {
  private readonly socket: WebSocket;
  private readonly contexto: AudioContext;
  private cursor = 0;
  private captura: (() => void) | null = null;
  private quiereHablar = false;
  private abriendo = false;
  private terminado = false;
  private manosLibres = false;
  private readonly niveles = { recibiendo: 0, enviando: 0, avisado: -Infinity, voz: -Infinity };

  constructor(private readonly opciones: OpcionesDelCanalWs) {
    this.contexto = (opciones.crearContexto ?? (() => new AudioContext()))();
    this.socket = (opciones.crearSocket ?? ((url) => new WebSocket(url)))(opciones.url);
    this.socket.binaryType = 'arraybuffer';
    opciones.alEstado({ fase: 'conectando' });
    this.socket.addEventListener('open', () => opciones.alEstado({ fase: 'escuchando' }));
    this.socket.addEventListener('message', (evento: MessageEvent<unknown>) => {
      this.alMensaje(evento.data);
    });
    this.socket.addEventListener('close', (evento: CloseEvent) => {
      this.terminar(
        evento.reason !== '' ? evento.reason : (MOTIVOS[evento.code] ?? 'Audio cerrado'),
      );
    });
  }

  /** Mantener pulsado: abre el micrófono y transmite hasta `soltar`. */
  async pulsar(manosLibres = false): Promise<void> {
    this.quiereHablar = true;
    if (this.terminado || this.captura !== null || this.abriendo) return;
    this.manosLibres = manosLibres;
    this.abriendo = true;
    try {
      const flujo = await (this.opciones.obtenerMicrofono ?? microfonoPorOmision)();
      if (!this.quiereHablar || this.terminado) {
        for (const pista of flujo.getTracks()) pista.stop();
        return;
      }
      this.enviarTexto(
        this.manosLibres ? { tipo: 'pulsar', modo: 'manos_libres' } : { tipo: 'pulsar' },
      );
      this.captura = this.capturar(flujo);
      this.opciones.alEstado({ fase: 'hablando', manosLibres: this.manosLibres });
    } finally {
      this.abriendo = false;
    }
  }

  /**
   * B3 (15-S2) · manos libres: el micrófono abierto hasta colgar (o hasta
   * `soltar`), con cancelación de eco y supresión de ruido. La bajada nunca se
   * detiene mientras se habla, ni aquí ni en la API.
   */
  manosLibresActivas(): Promise<void> {
    return this.pulsar(true);
  }

  soltar(): void {
    this.quiereHablar = false;
    this.manosLibres = false;
    if (this.captura === null) return;
    this.captura();
    this.captura = null;
    this.enviarTexto({ tipo: 'soltar' });
    if (!this.terminado) this.opciones.alEstado({ fase: 'escuchando' });
  }

  /** Colgar: la API suelta el turno y cierra el canal en el equipo. */
  cerrar(): void {
    this.quiereHablar = false;
    this.captura?.();
    this.captura = null;
    if (this.socket.readyState <= 1) this.socket.close(1000, 'El operador colgó');
    this.terminar('Conversación terminada');
  }

  private terminar(motivo: string): void {
    if (this.terminado) return;
    this.terminado = true;
    this.captura?.();
    this.captura = null;
    void this.contexto.close().catch(() => undefined);
    this.opciones.alEstado({ fase: 'cerrado', motivo });
  }

  private enviarTexto(mensaje: {
    readonly tipo: 'pulsar' | 'soltar' | 'voz';
    readonly modo?: 'manos_libres';
  }): void {
    if (this.socket.readyState === 1) this.socket.send(JSON.stringify(mensaje));
  }

  private alMensaje(datos: unknown): void {
    if (datos instanceof ArrayBuffer) {
      this.programar(new Uint8Array(datos));
      return;
    }
    if (typeof datos !== 'string') return;
    try {
      const aviso = JSON.parse(datos) as { tipo?: unknown; motivo?: unknown };
      if (aviso.tipo === 'semiduplex') this.opciones.alSemiduplex?.();
      if (aviso.tipo === 'cortado') {
        // El servidor cortó el tramo (turno caducado o tramo demasiado largo).
        this.quiereHablar = false;
        this.captura?.();
        this.captura = null;
        this.opciones.alEstado({
          fase: 'escuchando',
          aviso: typeof aviso.motivo === 'string' ? aviso.motivo : 'La API cortó el tramo',
        });
      }
    } catch {
      // Un texto que no es del protocolo no cambia nada.
    }
  }

  private programar(bytes: Uint8Array): void {
    if (bytes.length === 0 || this.terminado) return;
    const muestras = decodificar(this.opciones.formato, bytes);
    this.anotarNivel('recibiendo', nivelDe(muestras));
    const bufer = this.contexto.createBuffer(1, muestras.length, HZ_DEL_CANAL);
    bufer.copyToChannel(muestras, 0);
    const fuente = this.contexto.createBufferSource();
    fuente.buffer = bufer;
    fuente.connect(this.contexto.destination);
    const ahora = this.contexto.currentTime;
    if (this.cursor < ahora + COLCHON_S || this.cursor > ahora + ADELANTO_MAXIMO_S) {
      this.cursor = ahora + COLCHON_S;
    }
    fuente.start(this.cursor);
    this.cursor += bufer.duration;
  }

  /**
   * B3 · el nivel de un sentido, a la consola como mucho cuatro veces por
   * segundo; y en manos libres, «voz» a la API como mucho una vez por segundo
   * cuando el operador habla de verdad (el silencio no renueva el turno).
   */
  private anotarNivel(sentido: 'recibiendo' | 'enviando', nivel: number): void {
    const ahora = (this.opciones.ahora ?? Date.now)();
    this.niveles[sentido] = nivel;
    if (sentido === 'enviando' && this.manosLibres && nivel > UMBRAL_DE_VOZ) {
      if (ahora - this.niveles.voz >= 1000) {
        this.niveles.voz = ahora;
        this.enviarTexto({ tipo: 'voz' });
      }
    }
    if (ahora - this.niveles.avisado < 250) return;
    this.niveles.avisado = ahora;
    this.opciones.alNiveles?.({
      recibiendo: this.niveles.recibiendo,
      enviando: this.captura === null ? 0 : this.niveles.enviando,
    });
  }

  private capturar(flujo: MediaStream): () => void {
    const fuente = this.contexto.createMediaStreamSource(flujo);
    const procesador = this.contexto.createScriptProcessor(MUESTRAS_POR_BLOQUE, 1, 1);
    let pendiente: Uint8Array = new Uint8Array(0);
    procesador.onaudioprocess = (evento) => {
      const a8k = remuestrear(
        evento.inputBuffer.getChannelData(0),
        this.contexto.sampleRate,
        HZ_DEL_CANAL,
      );
      this.anotarNivel('enviando', nivelDe(a8k));
      const { trozos, resto } = trocear(
        pendiente,
        codificar(this.opciones.formato, a8k),
        BYTES_POR_TRAMA,
      );
      pendiente = resto;
      for (const trama of trozos) if (this.socket.readyState === 1) this.socket.send(trama);
    };
    // Sin destino algunos navegadores no procesan; con ganancia 0 no se oye a sí mismo.
    const silencio = this.contexto.createGain();
    silencio.gain.value = 0;
    fuente.connect(procesador);
    procesador.connect(silencio);
    silencio.connect(this.contexto.destination);
    return () => {
      procesador.onaudioprocess = null;
      procesador.disconnect();
      fuente.disconnect();
      for (const pista of flujo.getTracks()) pista.stop();
    };
  }
}

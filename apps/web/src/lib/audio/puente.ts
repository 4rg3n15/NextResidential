import { HZ_DEL_CANAL, codificar, decodificar, remuestrear } from './g711';
import type { FormatoG711 } from './g711';

/**
 * EL PUENTE DE AUDIO DEL NAVEGADOR · A4 (15-E) · ADR-01.
 *
 * El navegador nunca habla con el equipo: baja el audio por la API (un flujo
 * `application/octet-stream` que dura la sesión) y sube el suyo por trozos.
 * Aquí se decodifica lo que llega —en el códec que el canal ANUNCIA— y se
 * reproduce con `AudioContext`; y se captura el micrófono, se remuestrea a
 * 8 kHz, se codifica y se entrega en trozos de ~200 ms.
 *
 * Lo que este módulo NO tiene es medida: latencia extremo a extremo (KPI-33),
 * cadencia real del equipo y comportamiento semiduplex se miden en sitio con
 * la hoja de resultados. Lo que sí tiene es una frontera clara: todo lo que
 * depende del navegador entra por parámetros y se puede sustituir en pruebas.
 */
export interface ControlDeAudio {
  detener(): void;
}

export interface OpcionesDeReproduccion {
  readonly crearContexto?: () => AudioContext;
  readonly pedir?: typeof fetch;
  readonly alTerminar?: (motivo: 'fin' | 'error' | 'detenido') => void;
}

/** ~200 ms a 8 kHz y un byte por muestra. */
export const BYTES_POR_TROZO = 1600;

/** Junta bytes hasta completar trozos de tamaño fijo; devuelve lo que sobra. */
export const trocear = (
  pendiente: Uint8Array,
  nuevo: Uint8Array,
  tamano = BYTES_POR_TROZO,
): { readonly trozos: Uint8Array[]; readonly resto: Uint8Array } => {
  const junto = new Uint8Array(pendiente.length + nuevo.length);
  junto.set(pendiente, 0);
  junto.set(nuevo, pendiente.length);
  const trozos: Uint8Array[] = [];
  let i = 0;
  for (; i + tamano <= junto.length; i += tamano) trozos.push(junto.slice(i, i + tamano));
  return { trozos, resto: junto.slice(i) };
};

/**
 * Reproduce el flujo de bajada. Cada trozo se convierte en un `AudioBuffer` de
 * 8 kHz y se programa a continuación del anterior, con un colchón mínimo
 * para que un trozo tardío no deje un hueco audible.
 */
export const reproducirFlujo = async (
  url: string,
  formato: FormatoG711,
  opciones: OpcionesDeReproduccion = {},
): Promise<ControlDeAudio> => {
  const pedir = opciones.pedir ?? ((entrada, init) => globalThis.fetch(entrada, init));
  const contexto = (opciones.crearContexto ?? (() => new AudioContext()))();
  const control = new AbortController();
  const respuesta = await pedir(url, { credentials: 'same-origin', signal: control.signal });
  if (!respuesta.ok || respuesta.body === null) {
    await contexto.close();
    throw new Error(`El flujo de audio no se abrió (HTTP ${String(respuesta.status)})`);
  }

  const lector = respuesta.body.getReader();
  const COLCHON_S = 0.06;
  let cursor = 0;
  let detenido = false;

  const programar = (bytes: Uint8Array): void => {
    const muestras = decodificar(formato, bytes);
    const bufer = contexto.createBuffer(1, muestras.length, HZ_DEL_CANAL);
    bufer.copyToChannel(muestras, 0);
    const fuente = contexto.createBufferSource();
    fuente.buffer = bufer;
    fuente.connect(contexto.destination);
    const ahora = contexto.currentTime;
    if (cursor < ahora + COLCHON_S) cursor = ahora + COLCHON_S;
    fuente.start(cursor);
    cursor += bufer.duration;
  };

  void (async () => {
    let motivo: 'fin' | 'error' | 'detenido' = 'fin';
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done || detenido) break;
        if (value !== undefined && value.length > 0) programar(value);
      }
      if (detenido) motivo = 'detenido';
    } catch {
      motivo = detenido ? 'detenido' : 'error';
    } finally {
      await lector.cancel().catch(() => undefined);
      await contexto.close().catch(() => undefined);
      opciones.alTerminar?.(motivo);
    }
  })();

  return {
    detener: () => {
      detenido = true;
      control.abort();
      // Cancelar el lector resuelve la lectura pendiente aunque el transporte
      // no honre la señal: es lo que garantiza que «detener» detenga.
      void lector.cancel().catch(() => undefined);
    },
  };
};

export interface OpcionesDeCaptura {
  readonly crearContexto?: () => AudioContext;
  readonly obtenerMicrofono?: () => Promise<MediaStream>;
  readonly bytesPorTrozo?: number;
}

/**
 * Captura el micrófono y entrega trozos codificados. `ScriptProcessorNode`
 * está marcado como obsoleto y sigue siendo lo que todos los navegadores
 * ejecutan sin fichero aparte; un `AudioWorklet` es el refinamiento cuando
 * la medida en sitio lo justifique.
 */
export const capturarMicrofono = async (
  formato: FormatoG711,
  alTrozo: (trozo: Uint8Array) => void,
  opciones: OpcionesDeCaptura = {},
): Promise<ControlDeAudio> => {
  const obtener =
    opciones.obtenerMicrofono ??
    (() =>
      navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      }));
  const flujo = await obtener();
  const contexto = (opciones.crearContexto ?? (() => new AudioContext()))();
  const fuente = contexto.createMediaStreamSource(flujo);
  const procesador = contexto.createScriptProcessor(4096, 1, 1);
  let pendiente: Uint8Array = new Uint8Array(0);

  procesador.onaudioprocess = (evento) => {
    const entrada = evento.inputBuffer.getChannelData(0);
    const a8k = remuestrear(entrada, contexto.sampleRate, HZ_DEL_CANAL);
    const { trozos, resto } = trocear(pendiente, codificar(formato, a8k), opciones.bytesPorTrozo);
    pendiente = resto;
    for (const trozo of trozos) alTrozo(trozo);
  };
  fuente.connect(procesador);
  // Sin destino, algunos navegadores no procesan; con ganancia 0 no se oye a sí mismo.
  const silencio = contexto.createGain();
  silencio.gain.value = 0;
  procesador.connect(silencio);
  silencio.connect(contexto.destination);

  return {
    detener: () => {
      procesador.onaudioprocess = null;
      procesador.disconnect();
      fuente.disconnect();
      for (const pista of flujo.getTracks()) pista.stop();
      void contexto.close().catch(() => undefined);
    },
  };
};

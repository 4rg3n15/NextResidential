/**
 * Puertos del módulo de guardia.
 *
 * `CanalDeIntercom` es un puerto **de aplicación**, no del dominio, y la
 * distinción importa: el puerto del dominio —`IntercomProvider`— habla de UNA
 * sesión, porque eso es lo que un operador tiene. La consola de guardia virtual
 * necesita además el estado del canal **por copropiedad y dispositivo**, que es
 * información de operación y no intención de negocio. Meterla en el puerto del
 * dominio lo haría crecer para servir a una pantalla.
 */
export interface EstadoDeCanal {
  readonly dispositivoId: string;
  readonly estado: 'abierta' | 'en_espera' | 'cerrada';
  readonly porDelante: number;
  readonly titular: string | null;
  readonly timeoutSegundos: number;
  /**
   * ETAPA 15-E · por dónde va el audio de este canal. `equipo` cuando el
   * proveedor abrió el canal del aparato; `ninguno` cuando el turno existe
   * pero no hay transporte (el equipo no declara audio, o es el simulado sin
   * ese dispositivo). La consola tiene que poder decir «tienes la palabra y
   * no hay audio» en vez de dejar al operador hablando a un micrófono muerto.
   */
  readonly transporte: 'equipo' | 'ninguno';
  readonly detalleTransporte: string | null;
  /**
   * A4 · el códec que el equipo ANUNCIA para su canal (`g711u`, `g711a`…),
   * leído de sus capacidades; `null` sin transporte. La consola decodifica
   * lo que el equipo dice, no lo que alguien supuso.
   */
  readonly formatoDeAudio: string | null;
}

/** A4 · se pidió audio a quien no tiene la palabra, o a un turno sin transporte. */
export class SinTransporteDeAudio extends Error {
  constructor(
    readonly dispositivoId: string,
    readonly motivo: string,
  ) {
    super(`No hay audio con el equipo ${dispositivoId}: ${motivo}`);
    this.name = 'SinTransporteDeAudio';
  }
}

/**
 * El turno se concedió y el equipo NO pudo abrir el canal. El turno se suelta
 * antes de lanzar: un operador con la palabra sobre un canal muerto bloquearía
 * al siguiente hasta la caducidad.
 */
export class TransporteDeAudioNoDisponible extends Error {
  constructor(
    readonly dispositivoId: string,
    readonly motivo: string,
  ) {
    super(`El equipo ${dispositivoId} no abrió el canal de audio: ${motivo}`);
    this.name = 'TransporteDeAudioNoDisponible';
  }
}

export interface CanalDeIntercom {
  pedir(copropiedadId: string, dispositivoId: string, operadorId: string): Promise<EstadoDeCanal>;
  soltar(copropiedadId: string, dispositivoId: string, operadorId: string): Promise<EstadoDeCanal>;
  estado(copropiedadId: string, dispositivoId: string, operadorId: string): Promise<EstadoDeCanal>;
  /**
   * A4 · el audio de la sesión, SÓLO para el titular del turno. Bajada: lo
   * que el equipo emite, en su formato. Subida: un trozo hacia el equipo.
   * Sin turno o sin transporte lanzan `SinTransporteDeAudio`.
   */
  recibirAudio(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
  ): AsyncIterable<Uint8Array>;
  enviarAudio(
    copropiedadId: string,
    dispositivoId: string,
    operadorId: string,
    fragmento: Uint8Array,
  ): Promise<void>;
}

export const CANAL_DE_INTERCOM = Symbol.for('ncr.puerto.CanalDeIntercom');

/**
 * Escalamiento de una alerta, declarado por el CONSUMIDOR.
 *
 * `EscalarAlerta` vive en el módulo de eventos y no sale por su barril. En vez
 * de ampliarlo —lo que ataría `guardia` a la clase concreta de otro módulo—, se
 * declara aquí la FORMA que este módulo necesita, y el token lo publica
 * `eventos` (`ESCALAMIENTO_DE_ALERTA`). Es la misma decisión que
 * `ResolutorDeZona` (§2.2): el consumidor declara la forma, no importa la clase.
 */
export interface EscalamientoDeAlerta {
  ejecutar(
    alerta: unknown,
    actorId: string,
  ): Promise<{ readonly destinatarios: number; readonly latenciaMs: number }>;
}

/* ── A5 (15-E) · vista en vivo ───────────────────────────────────────────── */

/**
 * El PUENTE DE VIDEO, declarado por el consumidor. Traduce el flujo del equipo
 * (RTSP) a WebRTC para el navegador; hoy lo implementa go2rtc, pero el puerto
 * no lo nombra. Dos operaciones y nada más:
 *
 *  - `asegurarFlujo` registra —o reemplaza— la FUENTE bajo un nombre. La
 *    fuente es la URL RTSP con la credencial del equipo, que sale del
 *    proveedor y entra aquí sin pasar por ningún otro sitio: ni respuesta,
 *    ni bitácora, ni cliente (RN-12, RN-21).
 *  - `negociar` entrega la oferta SDP del navegador y devuelve la respuesta.
 *    La API la reenvía tal cual: el navegador negocia con la API, nunca con
 *    el puente, y la API sólo llega aquí tras validar sesión, rol y
 *    copropiedad.
 */
export interface PuenteDeVideo {
  asegurarFlujo(nombre: string, fuente: string): Promise<void>;
  negociar(nombre: string, ofertaSdp: string): Promise<string>;
}

export const PUENTE_DE_VIDEO = Symbol.for('ncr.puerto.PuenteDeVideo');

/** No hay `GO2RTC_URL`: la vista en vivo no está desplegada. 503 con motivo. */
export class PuenteDeVideoNoConfigurado extends Error {
  constructor() {
    super(
      'La vista en vivo no está configurada en esta API: falta GO2RTC_URL (puente RTSP → WebRTC)',
    );
    this.name = 'PuenteDeVideoNoConfigurado';
  }
}

/** El equipo no ofrece video —por tipo, por registro o por fallo al resolverlo—. 409. */
export class SinOrigenDeVideo extends Error {
  constructor(
    readonly dispositivoId: string,
    readonly motivo: string,
  ) {
    super(`El equipo ${dispositivoId} no ofrece video: ${motivo}`);
    this.name = 'SinOrigenDeVideo';
  }
}

/** El puente respondió mal o no respondió. 502: la API es pasarela hacia él. */
export class PuenteDeVideoFallo extends Error {
  constructor(readonly motivo: string) {
    super(`El puente de video no atendió la petición: ${motivo}`);
    this.name = 'PuenteDeVideoFallo';
  }
}

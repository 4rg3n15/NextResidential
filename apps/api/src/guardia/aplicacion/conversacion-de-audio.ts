import type { Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import type { CanalDeIntercom, MedidorDeDuplex } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P2 · UNA CONVERSACIÓN DE GUARDIA POR EL CANAL ORDENADO (ADR-01, enm. 15-P)
 *
 * Lo que la API decide mientras dura el audio, sin saber nada del transporte:
 *
 *  · sólo empieza si quien la abre TIENE LA PALABRA y el canal del equipo está
 *    abierto (la máquina del dominio reparte el turno; aquí no se reparte);
 *  · la escucha empieza al abrir, sin pulsar nada;
 *  · el audio de subida sólo pasa entre «pulsar» y «soltar»: lo demás se
 *    descarta aquí, no se confía en que el navegador deje de mandarlo;
 *  · el SERVIDOR corta: un tramo que pasa de `tramoMaximoS` (el micrófono se
 *    quedó abierto) y un turno que caduca por inactividad (90 s del dominio,
 *    renovado por la actividad del operador);
 *  · límites propios por mensaje: tramas fuera de tamaño o demasiadas por
 *    segundo cierran la conversación;
 *  · al terminar, por la causa que sea, se suelta el turno —y con él el
 *    `close` en el equipo— y queda la constancia: quién, qué equipo, cuándo
 *    empezó y acabó y qué tramos se hablaron. Nunca el audio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ParticipantesDeConversacion {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly operadorId: string;
}

/** Lo que la conversación le pide al transporte: es la frontera con el WebSocket. */
export interface SalidaDeConversacion {
  audio(trama: Uint8Array): void;
  aviso(motivo: string): void;
  cerrar(codigo: number, motivo: string): void;
  /** B3 (15-S2) · el equipo resultó semidúplex: la consola muestra el turno. */
  semiduplex?(): void;
}

export interface TramoHablado {
  readonly desde: Date;
  readonly hasta: Date;
}

export interface ConversacionTerminada extends ParticipantesDeConversacion {
  readonly id: string;
  readonly iniciadaEn: Date;
  readonly terminadaEn: Date;
  readonly tramos: readonly TramoHablado[];
  readonly motivoDeCierre: string;
}

export interface RegistroDeConversaciones {
  registrar(conversacion: ConversacionTerminada): Promise<void>;
}
export const REGISTRO_DE_CONVERSACIONES = Symbol.for('ncr.puerto.RegistroDeConversaciones');

/** Códigos de cierre del canal (4000–4999 son de la aplicación en RFC 6455). */
export const CIERRES = { caducado: 4001, sinTurno: 4003, abuso: 4008, equipo: 4010 } as const;

export interface LimitesDeConversacion {
  /** [SUPUESTO] S-177 · 60 s de micrófono abierto sin soltar es un botón trabado. */
  readonly tramoMaximoS: number;
  /** 50 tramas de 20 ms por segundo, con holgura para la ráfaga de un navegador ocupado. */
  readonly tramasPorSegundo: number;
  /** 1600 B = 200 ms de G.711: el mayor trozo que tiene sentido en un mensaje. */
  readonly bytesPorTrama: number;
  readonly textosPorSegundo: number;
}
export const LIMITES_POR_OMISION: LimitesDeConversacion = {
  tramoMaximoS: 60,
  tramasPorSegundo: 100,
  bytesPorTrama: 1600,
  textosPorSegundo: 10,
};

export interface Temporizador {
  cadaSegundo(fn: () => void): () => void;
}
export const TEMPORIZADOR_REAL: Temporizador = {
  cadaSegundo: (fn) => {
    const t = setInterval(fn, 1000);
    t.unref();
    return () => clearInterval(t);
  },
};

export interface DependenciasDeConversacion {
  readonly canal: CanalDeIntercom;
  readonly registro: RegistroDeConversaciones;
  readonly reloj: Reloj;
  readonly ids: GeneradorDeId;
  readonly bitacora: Bitacora;
  readonly temporizador: Temporizador;
  readonly crearMedidorDeDuplex?: () => MedidorDeDuplex; // B3 (15-S2) · sin él no se mide
}

/** Tramas que esperan al equipo: más es retraso, y en vivo se descarta. */
const SUBIDA_MAXIMA_EN_VUELO = 25;

export class ConversacionDeAudio {
  private readonly tramos: TramoHablado[] = [];
  private pulsadoDesde: Date | null = null;
  private iniciadaEn: Date | null = null;
  private cerrada = false;
  private detenerVigilancia: (() => void) | null = null;
  private bajada: AsyncIterator<Uint8Array> | null = null;
  private subida: Promise<void> = Promise.resolve();
  private enVuelo = 0;
  private ultimaRenovacion = 0;
  /** B3 · manos libres: el silencio no renueva el turno («voz» sí) y S-177 parte tramos, no corta. */
  private manosLibres = false;
  private readonly duplex: MedidorDeDuplex | null;
  private readonly cuenta = { segundo: -1, tramas: 0, textos: 0 };

  constructor(
    private readonly d: DependenciasDeConversacion,
    private readonly p: ParticipantesDeConversacion,
    private readonly salida: SalidaDeConversacion,
    private readonly limites: LimitesDeConversacion = LIMITES_POR_OMISION,
  ) {
    this.duplex = d.crearMedidorDeDuplex?.() ?? null;
  }

  /** `false` si no tiene la palabra: se cierra el canal sin abrir nada. */
  async iniciar(): Promise<boolean> {
    const estado = await this.d.canal.estado(
      this.p.copropiedadId,
      this.p.dispositivoId,
      this.p.operadorId,
    );
    if (estado.estado !== 'abierta' || estado.transporte !== 'equipo') {
      this.cerrada = true;
      this.salida.cerrar(CIERRES.sinTurno, 'Sin la palabra o sin el canal del equipo abierto');
      return false;
    }
    this.iniciadaEn = this.d.reloj.ahora();
    this.detenerVigilancia = this.d.temporizador.cadaSegundo(() => void this.vigilar());
    void this.escuchar();
    return true;
  }

  alTexto(texto: string): void {
    if (this.cerrada || !this.dentroDelLimite('textos')) return;
    let mensaje: { tipo?: unknown; modo?: unknown };
    try {
      mensaje = JSON.parse(texto) as { tipo?: unknown; modo?: unknown };
    } catch {
      return;
    }
    if (mensaje.tipo === 'pulsar' && this.pulsadoDesde === null) {
      this.pulsadoDesde = this.d.reloj.ahora();
      this.manosLibres = mensaje.modo === 'manos_libres';
    } else if (mensaje.tipo === 'soltar') {
      this.cerrarTramo();
      this.manosLibres = false;
    }
    this.renovar(true);
  }

  alAudio(trama: Uint8Array): void {
    if (this.cerrada || !this.dentroDelLimite('tramas')) return;
    if (trama.length === 0 || trama.length > this.limites.bytesPorTrama) {
      void this.cortar(
        CIERRES.abuso,
        'Una trama de audio fuera de tamaño: la API cortó la conversación',
      );
      return;
    }
    // Sin «pulsar», el micrófono no tiene la palabra: se descarta aquí.
    if (this.pulsadoDesde === null || this.enVuelo >= SUBIDA_MAXIMA_EN_VUELO) return;
    this.enVuelo += 1;
    this.duplex?.contarSubida(trama.length);
    const { copropiedadId, dispositivoId, operadorId } = this.p;
    this.subida = this.subida
      .then(() => this.d.canal.enviarAudio(copropiedadId, dispositivoId, operadorId, trama))
      .catch(() => this.cortar(CIERRES.equipo, 'El equipo no aceptó el audio'))
      .finally(() => {
        this.enVuelo -= 1;
      });
    if (!this.manosLibres) this.renovar(false);
  }

  /** Idempotente: el cierre del socket, un corte del servidor o el fin de la escucha. */
  async terminar(motivo: string): Promise<void> {
    const iniciadaEn = this.iniciadaEn;
    this.cerrada = true;
    if (iniciadaEn === null) return;
    this.iniciadaEn = null;
    this.detenerVigilancia?.();
    this.cerrarTramo();
    void this.bajada?.return?.(undefined);
    await this.subida;
    const { copropiedadId, dispositivoId, operadorId } = this.p;
    await this.d.canal.soltar(copropiedadId, dispositivoId, operadorId).catch((e: unknown) => {
      this.anotar('aviso', 'no se pudo soltar el turno al terminar la conversación', e);
    });
    const terminadaEn = this.d.reloj.ahora();
    const conversacion = {
      id: this.d.ids.nuevo(),
      ...this.p,
      iniciadaEn,
      terminadaEn,
      tramos: [...this.tramos],
      motivoDeCierre: motivo,
    };
    await this.d.registro.registrar(conversacion).catch((e: unknown) => {
      this.anotar('error', 'la conversación de guardia no quedó registrada', e);
    });
    this.d.bitacora.registrar('info', 'conversación de guardia terminada', {
      dispositivoId,
      operadorId,
      tramos: this.tramos.length,
      motivo,
    });
  }

  private async cortar(codigo: number, motivo: string): Promise<void> {
    if (this.cerrada) return;
    this.salida.cerrar(codigo, motivo);
    await this.terminar(motivo);
  }

  private async escuchar(): Promise<void> {
    const { copropiedadId, dispositivoId, operadorId } = this.p;
    try {
      const fuente = this.d.canal.recibirAudio(copropiedadId, dispositivoId, operadorId);
      this.bajada = fuente[Symbol.asyncIterator]();
      for (;;) {
        const { done, value } = await this.bajada.next();
        if (done === true || this.cerrada) break;
        this.duplex?.contarBajada(value.length);
        this.salida.audio(value);
      }
    } catch (e) {
      this.anotar('aviso', 'la escucha del equipo terminó con error', e);
    }
    await this.cortar(CIERRES.equipo, 'El equipo cerró el canal de audio');
  }

  private async vigilar(): Promise<void> {
    const ahora = this.d.reloj.ahora();
    if (
      this.pulsadoDesde !== null &&
      ahora.getTime() - this.pulsadoDesde.getTime() > this.limites.tramoMaximoS * 1000
    ) {
      this.cerrarTramo();
      if (this.manosLibres) this.pulsadoDesde = ahora;
      else
        this.salida.aviso(
          `El tramo superó los ${String(this.limites.tramoMaximoS)} s: suelte y vuelva a pulsar para seguir hablando`,
        );
    }
    if (this.duplex?.tic() === true) this.salida.semiduplex?.();
    const { copropiedadId, dispositivoId, operadorId } = this.p;
    const estado = await this.d.canal.estado(copropiedadId, dispositivoId, operadorId);
    if (estado.estado !== 'abierta' || estado.transporte !== 'equipo') {
      await this.cortar(CIERRES.caducado, 'El turno caducó por inactividad');
    }
  }

  private cerrarTramo(): void {
    if (this.pulsadoDesde === null) return;
    this.tramos.push({ desde: this.pulsadoDesde, hasta: this.d.reloj.ahora() });
    this.pulsadoDesde = null;
  }

  /** Lo que hace el operador renueva el turno; el audio, como mucho una vez por segundo. */
  private renovar(siempre: boolean): void {
    const ahora = this.d.reloj.ahora().getTime();
    if (!siempre && ahora - this.ultimaRenovacion < 1000) return;
    this.ultimaRenovacion = ahora;
    const { copropiedadId, dispositivoId, operadorId } = this.p;
    void this.d.canal.renovar(copropiedadId, dispositivoId, operadorId).then((sigue) => {
      if (!sigue) void this.cortar(CIERRES.caducado, 'El turno ya no es suyo');
    });
  }

  private dentroDelLimite(clase: 'tramas' | 'textos'): boolean {
    const segundo = Math.floor(this.d.reloj.ahora().getTime() / 1000);
    if (segundo !== this.cuenta.segundo)
      Object.assign(this.cuenta, { segundo, tramas: 0, textos: 0 });
    this.cuenta[clase] += 1;
    const tope = clase === 'tramas' ? this.limites.tramasPorSegundo : this.limites.textosPorSegundo;
    if (this.cuenta[clase] <= tope) return true;
    void this.cortar(
      CIERRES.abuso,
      'Demasiados mensajes de audio por segundo: la API cortó la conversación',
    );
    return false;
  }

  private anotar(nivel: 'aviso' | 'error', mensaje: string, error: unknown): void {
    this.d.bitacora.registrar(nivel, mensaje, {
      dispositivoId: this.p.dispositivoId,
      operadorId: this.p.operadorId,
      detalle: error instanceof Error ? error.message : String(error),
    });
  }
}

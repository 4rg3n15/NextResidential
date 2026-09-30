import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { CanalTiempoReal } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * TODO LO QUE UN EQUIPO EMITE, GUARDADO Y A LA VISTA · ETAPA 15-L (Bloque B)
 *
 * El requisito del cliente es literal: toda pulsación o interacción con un
 * equipo aparece en la consola de eventos. Un ACCESO sigue yendo a `eventos`
 * por el motor de reglas; lo demás —puerta, botón, timbre, llamada, sabotaje,
 * estado, un código sin catalogar— y lo que la plataforma HACE con un equipo
 * (una apertura ordenada y su desenlace, A1; la cámara que decidió por su
 * cuenta, A4) viene aquí: `eventos_de_equipo`, sólo inserción (0040).
 *
 * Dos velocidades, y es a propósito:
 *
 *  · lo VIVO se escribe en el acto y sale por el canal de tiempo real, con la
 *    latencia medida de recibido a publicado (la misma vara que KPI-25);
 *  · lo HISTÓRICO —el volcado al conectar, que pueden ser miles— va a una
 *    cola que se vacía por lotes y NUNCA delante de un evento vivo: detrás
 *    de él puede haber una terminal esperando veredicto con 5 s de plazo.
 *    Si la cola se llena, lo que no cabe se cuenta y se dice.
 *
 * El equipo reenvía: la clave de idempotencia (su serie, su hora, su uid) hace
 * que el reenvío no cree una segunda fila (B3).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface EventoDeEquipoNuevo {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly codigoMayor: number | null;
  readonly codigoMenor: number | null;
  readonly origen: 'equipo' | 'plataforma';
  readonly enVivo: boolean;
  readonly ocurridoEn: Date;
  readonly horaDelEquipo: string | null;
  /** El acceso de `eventos` al que acompaña, si lo hay. */
  readonly eventoId: string | null;
  readonly claveIdempotencia: string;
  readonly carga: Readonly<Record<string, unknown>>;
  readonly creadoPor: string;
}

export interface EventoDeEquipoGuardado extends EventoDeEquipoNuevo {
  readonly id: string;
  readonly recibidoEn: Date;
}

export interface FiltroDeEventosDeEquipo {
  readonly copropiedadId: string;
  readonly desde: Date;
  readonly hasta: Date;
  readonly dispositivoId?: string | null;
  readonly tipo?: string | null;
  /** G1 (15-N) · varios tipos a la vez (la cola de atención). */
  readonly tipos?: readonly string[] | null;
  /**
   * G1 (15-N) · la ventana por la hora de RECEPCIÓN y no por la del equipo: un
   * videoportero con el reloj 13 h atrasado (29/09) quedaba fuera de «lo último».
   */
  readonly porRecepcion?: boolean;
  /** G1 (15-N) · sólo lo que el equipo emitió EN VIVO. */
  readonly soloEnVivo?: boolean;
  readonly limite: number;
}

export interface RepositorioEventosDeEquipo {
  /** `null` cuando la clave ya estaba: el equipo reenvió. */
  registrar(e: EventoDeEquipoNuevo): Promise<EventoDeEquipoGuardado | null>;
  /** Por lotes, para el volcado histórico. Devuelve cuántas filas NUEVAS. */
  registrarVarios(eventos: readonly EventoDeEquipoNuevo[]): Promise<number>;
  consultar(filtro: FiltroDeEventosDeEquipo): Promise<readonly EventoDeEquipoGuardado[]>;
}

export const REPOSITORIO_EVENTOS_DE_EQUIPO = Symbol.for('ncr.puerto.RepositorioEventosDeEquipo');
export const REGISTRO_DE_EVENTOS_DE_EQUIPO = Symbol.for('ncr.eventos.RegistroDeEventosDeEquipo');
/** El tema del canal por el que la consola recibe cada evento de equipo. */
export const TEMA_EVENTOS_DE_EQUIPO = 'eventos-de-equipo';

/** Lo que el canal lleva de un evento de equipo: lo que la consola pinta. */
export const aLaConsola = (e: EventoDeEquipoGuardado) => ({
  id: e.id,
  dispositivoId: e.dispositivoId,
  tipo: e.tipo,
  titulo: e.titulo,
  codigo:
    e.codigoMayor === null || e.codigoMenor === null
      ? null
      : { mayor: e.codigoMayor, menor: e.codigoMenor },
  origen: e.origen,
  enVivo: e.enVivo,
  ocurridoEn: e.ocurridoEn.toISOString(),
  recibidoEn: e.recibidoEn.toISOString(),
  eventoId: e.eventoId,
  carga: e.carga,
});

export interface OpcionesDelRegistro {
  /** Techo de la cola de históricos. Lo que no cabe se cuenta y se dice. */
  readonly maximoEnCola?: number;
  /** Filas por lote al vaciar la cola. */
  readonly lote?: number;
}

export class RegistroDeEventosDeEquipo {
  private readonly cola: EventoDeEquipoNuevo[] = [];
  private vaciando: Promise<void> | null = null;
  private fueraDeCola = 0;

  constructor(
    private readonly repositorio: RepositorioEventosDeEquipo,
    private readonly canal: CanalTiempoReal,
    private readonly bitacora: Bitacora,
    private readonly reloj: Reloj,
    private readonly opciones: OpcionesDelRegistro = {},
  ) {}

  /**
   * Un evento que ocurre AHORA: se escribe y se publica. Nunca lanza: perder
   * el aviso en la consola es malo; tumbar la ingesta del equipo, peor.
   */
  async vivo(e: EventoDeEquipoNuevo): Promise<EventoDeEquipoGuardado | null> {
    const comienzo = this.reloj.ahora().getTime();
    try {
      const guardado = await this.repositorio.registrar(e);
      if (guardado === null) {
        this.bitacora.registrar('debug', 'evento de equipo reenviado: ya estaba', {
          dispositivoId: e.dispositivoId,
          tipo: e.tipo,
        });
        return null;
      }
      const destinatarios = await this.canal.publicar(
        e.copropiedadId,
        TEMA_EVENTOS_DE_EQUIPO,
        aLaConsola(guardado),
      );
      this.bitacora.registrar('info', 'evento de equipo a la consola', {
        copropiedadId: e.copropiedadId,
        dispositivoId: e.dispositivoId,
        tipo: e.tipo,
        origen: e.origen,
        destinatarios,
        // De recibido a publicado: la cifra con la que se sostiene «en vivo».
        latenciaMs: this.reloj.ahora().getTime() - comienzo,
      });
      return guardado;
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo guardar un evento de equipo', {
        copropiedadId: e.copropiedadId,
        dispositivoId: e.dispositivoId,
        tipo: e.tipo,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /** Un evento del volcado histórico: a la cola, sin esperar. */
  historico(e: EventoDeEquipoNuevo): void {
    if (this.cola.length >= (this.opciones.maximoEnCola ?? 5000)) {
      this.fueraDeCola += 1;
      if (this.fueraDeCola === 1 || this.fueraDeCola % 1000 === 0) {
        this.bitacora.registrar('aviso', 'volcado histórico mayor que la cola: no se guarda todo', {
          dispositivoId: e.dispositivoId,
          fueraDeCola: this.fueraDeCola,
          remedio: 'el equipo conserva su historial; se puede volver a pedir más tarde',
        });
      }
      return;
    }
    this.cola.push(e);
    this.vaciando ??= this.vaciar().finally(() => {
      this.vaciando = null;
    });
  }

  /** Para las pruebas y el apagado: espera a que la cola quede vacía. */
  async vaciada(): Promise<void> {
    while (this.vaciando !== null) await this.vaciando;
  }

  private async vaciar(): Promise<void> {
    // Un tic antes de empezar: lo vivo que llegó a la vez va primero.
    await new Promise((listo) => setImmediate(listo));
    while (this.cola.length > 0) {
      const lote = this.cola.splice(0, this.opciones.lote ?? 200);
      try {
        const nuevos = await this.repositorio.registrarVarios(lote);
        this.bitacora.registrar('info', 'volcado histórico de equipo guardado', {
          recibidos: lote.length,
          nuevos,
          pendientes: this.cola.length,
        });
      } catch (error) {
        this.bitacora.registrar('error', 'no se pudo guardar un lote del volcado histórico', {
          recibidos: lote.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await new Promise((listo) => setImmediate(listo));
    }
  }
}

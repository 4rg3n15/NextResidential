import { Alerta, esFallo } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj, Severidad, TipoDeAlerta } from '@ncr/domain-core';
import type { EscalarAlerta } from './escalamiento';
import type { RepositorioAlertas, UltimaAlerta } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E5 / C7 (ETAPA 15-M) · UNA ALERTA POR CONDICIÓN, NO UNA POR LECTURA
 *
 * En sitio (28/09) cada lectura de placa de una cámara sin atestación abrió
 * una alerta nueva, y el operador dejó de mirarlas: la forma habitual de que
 * un sistema de alertas deje de servir. Aquí se decide, con una función pura,
 * si una alerta nueva de un (equipo, tipo, clave) merece abrirse:
 *
 *  · `persistente` (la cámara decide sola, el reloj desviado): mientras haya
 *    una abierta o en atención del mismo equipo y clave, NO se abre otra. La
 *    condición dura; la alerta también. Se vuelve a abrir cuando alguien la
 *    resolvió o archivó Y pasó la ventana.
 *  · no persistente (acceso dudoso, apertura fallida): una por ventana de
 *    tiempo (`ALERTAS_VENTANA_DEDUP_S`, 10 min por omisión).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const VENTANA_DE_DUPLICADOS_MS = 10 * 60_000;

export interface Deduplicacion {
  readonly abrir: boolean;
  readonly motivo: string;
}

export const debeAbrirAlerta = (opciones: {
  readonly ultima: UltimaAlerta | null;
  readonly ahora: Date;
  readonly ventanaMs: number;
  readonly persistente: boolean;
}): Deduplicacion => {
  const { ultima, ahora, ventanaMs, persistente } = opciones;
  if (ultima === null) return { abrir: true, motivo: 'primera de su clase para este equipo' };
  const vigente = !ultima.archivada && ultima.estado !== 'resuelta';
  if (persistente && vigente) {
    return { abrir: false, motivo: `ya hay una abierta (${ultima.id}) mientras dure la condición` };
  }
  const haceMs = ahora.getTime() - ultima.generadaEn.getTime();
  if (haceMs >= 0 && haceMs < ventanaMs) {
    return {
      abrir: false,
      motivo: `ya se abrió una hace ${String(Math.round(haceMs / 1000))} s (ventana ${String(Math.round(ventanaMs / 1000))} s)`,
    };
  }
  return { abrir: true, motivo: 'fuera de la ventana de duplicados' };
};

export interface AlertaDeEquipoNueva {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly tipo: TipoDeAlerta;
  readonly severidad: Severidad;
  /** Distingue condiciones distintas del mismo tipo: va al principio de las notas. */
  readonly clave: string;
  readonly notas: string;
  readonly persistente: boolean;
  readonly eventoId?: string | null;
}

export interface ResultadoDeAlertaDeEquipo {
  readonly alerta: Alerta | null;
  readonly motivo: string;
}

/** Las notas llevan la clave delante: `[clave] texto`. Es lo que la deduplicación busca. */
export const notasConClave = (clave: string, notas: string): string => `[${clave}] ${notas}`;

/**
 * Abre —o no— una alerta ligada a un EQUIPO, sellada con la hora de RECEPCIÓN
 * de la API (nunca con la del equipo: un reloj adelantado daba latencias
 * negativas), deduplicada, guardada y escalada. Nunca lanza: la ingesta pesa
 * más que su alerta.
 */
export class AbrirAlertaDeEquipo {
  /**
   * G2 (15-N) · la última decisión en curso por (copropiedad, equipo, tipo,
   * clave). Dos avisos de la misma llamada llegan en dos peticiones a la vez
   * (`VoiceTalkEvent` y el 5/51): sin esperar a la anterior, los dos leían «no
   * hay ninguna» y abrían dos. Basta en un proceso: la API es una.
   */
  private readonly enCurso = new Map<string, Promise<unknown>>();

  constructor(
    private readonly alertas: RepositorioAlertas,
    private readonly escalador: EscalarAlerta,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeId,
    private readonly bitacora: Bitacora,
    private readonly ventanaMs: number = VENTANA_DE_DUPLICADOS_MS,
  ) {}

  async ejecutar(nueva: AlertaDeEquipoNueva, actorId: string): Promise<ResultadoDeAlertaDeEquipo> {
    const clave = [nueva.copropiedadId, nueva.dispositivoId, nueva.tipo, nueva.clave].join('|');
    const anterior = this.enCurso.get(clave) ?? Promise.resolve();
    const esta = anterior.then(() => this.decidir(nueva, actorId));
    this.enCurso.set(clave, esta);
    try {
      return await esta;
    } finally {
      if (this.enCurso.get(clave) === esta) this.enCurso.delete(clave);
    }
  }

  private async decidir(
    nueva: AlertaDeEquipoNueva,
    actorId: string,
  ): Promise<ResultadoDeAlertaDeEquipo> {
    try {
      const ahora = this.reloj.ahora();
      // G2 (15-N) · lista negra y pánico NUNCA se deduplican (S-124): dos intentos
      // seguidos pueden ser dos personas, y cada uno tiene que llegar al operador.
      const siempre = nueva.tipo === 'lista_negra' || nueva.tipo === 'panico';
      const ultima = siempre
        ? null
        : await this.alertas.ultimaDe(
            nueva.copropiedadId,
            nueva.dispositivoId,
            nueva.tipo,
            nueva.clave,
          );
      const decision = debeAbrirAlerta({
        ultima,
        ahora,
        ventanaMs: this.ventanaMs,
        persistente: nueva.persistente,
      });
      if (!decision.abrir) {
        this.bitacora.registrar('debug', 'alerta de equipo deduplicada', {
          dispositivoId: nueva.dispositivoId,
          tipo: nueva.tipo,
          clave: nueva.clave,
          motivo: decision.motivo,
        });
        return { alerta: null, motivo: decision.motivo };
      }
      const abierta = Alerta.abrir({
        id: this.ids.nuevo(),
        copropiedadId: nueva.copropiedadId,
        tipo: nueva.tipo,
        severidad: nueva.severidad,
        generadaEn: ahora,
        dispositivoId: nueva.dispositivoId,
        eventoId: nueva.eventoId ?? null,
        notas: notasConClave(nueva.clave, nueva.notas).slice(0, 500),
      });
      if (esFallo(abierta)) return { alerta: null, motivo: abierta.error.detalle };
      await this.alertas.guardar(abierta.valor, actorId);
      await this.escalador.ejecutar(abierta.valor, actorId);
      return { alerta: abierta.valor, motivo: decision.motivo };
    } catch (error) {
      this.bitacora.registrar('error', 'no se pudo abrir la alerta de equipo', {
        dispositivoId: nueva.dispositivoId,
        tipo: nueva.tipo,
        error: error instanceof Error ? error.message : String(error),
      });
      return { alerta: null, motivo: 'fallo al abrir la alerta' };
    }
  }
}

/** El puerto que el ingestor consume: lo declara aquí quien lo implementa. */
export const ALERTAS_DE_EQUIPO = Symbol.for('ncr.eventos.AlertasDeEquipo');
export interface AlertasDeEquipo {
  ejecutar(nueva: AlertaDeEquipoNueva, actorId: string): Promise<ResultadoDeAlertaDeEquipo>;
}

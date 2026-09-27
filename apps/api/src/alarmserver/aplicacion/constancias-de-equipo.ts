import type { GeneradorDeId, ResultadoDeAccionamiento } from '@ncr/domain-core';
import type { EventoDeEquipo, VeredictoRemoto } from '@ncr/providers';
import type { RegistroDeEventosDeEquipo } from '../../eventos';
import { filaDeEventoDeEquipo } from './fila-de-evento-de-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE EL RECEPTOR DEJA EN LA LÍNEA DE TIEMPO · 15-L (Bloques A y B)
 *
 * El ingestor decide qué camino sigue un evento; esto escribe la constancia
 * que la consola enseña, en cuatro formas:
 *
 *  · lo que el EQUIPO emitió y no es un acceso (vivo o histórico);
 *  · A1 · la apertura que la PLATAFORMA ordenó por una lectura, con el
 *    desenlace que dio el equipo, en lenguaje de persona;
 *  · A4 · «la cámara decidió por su cuenta»: la lectura se registró y se
 *    enseña igual, marcada, cuando el equipo no opera bajo la plataforma;
 *  · el veredicto que la plataforma devolvió a una terminal que preguntaba.
 *
 * Nunca lanza: `RegistroDeEventosDeEquipo` ya traga y registra sus fallos.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type RegistroDeConstancias = Pick<RegistroDeEventosDeEquipo, 'vivo' | 'historico'>;

/** Para quien no tiene dónde escribirlas (pruebas antiguas del ingestor). */
export const constanciasSinRegistro: RegistroDeConstancias = {
  vivo: async () => null,
  historico: () => undefined,
};

const DESENLACE: Record<ResultadoDeAccionamiento['estado'], string> = {
  aceptada: 'el equipo la aceptó',
  rechazada: 'el equipo la rechazó',
  inalcanzable: 'el equipo no respondió',
};

export class ConstanciasDeEquipo {
  constructor(
    private readonly registro: RegistroDeConstancias,
    private readonly ids: GeneradorDeId,
  ) {}

  async delEquipo(evento: EventoDeEquipo, copropiedadId: string): Promise<void> {
    const fila = filaDeEventoDeEquipo(evento, copropiedadId, this.ids);
    if (evento.enVivo) await this.registro.vivo(fila);
    else this.registro.historico(fila);
  }

  async apertura(
    evento: EventoDeEquipo,
    copropiedadId: string,
    orden: ResultadoDeAccionamiento,
    eventoId: string | null,
  ): Promise<void> {
    const motivo = orden.estado === 'aceptada' ? null : orden.motivo;
    await this.registro.vivo(
      filaDeEventoDeEquipo(evento, copropiedadId, this.ids, {
        origen: 'plataforma',
        tipo: 'apertura_ordenada',
        titulo: (
          `Apertura ordenada por la plataforma: ${DESENLACE[orden.estado]}` +
          (motivo === null ? '' : ` — ${motivo}`)
        ).slice(0, 200),
        eventoId,
        sufijo: 'apertura',
        carga: {
          estado: orden.estado,
          motivo,
          latenciaMs: orden.latenciaMs,
          actor: 'motor de reglas (ingesta)',
        },
      }),
    );
  }

  async decidioLaCamara(
    evento: EventoDeEquipo,
    copropiedadId: string,
    motivo: string,
    eventoId: string | null,
  ): Promise<void> {
    await this.registro.vivo(
      filaDeEventoDeEquipo(evento, copropiedadId, this.ids, {
        origen: 'plataforma',
        tipo: 'la_camara_decidio',
        titulo: 'La cámara decidió por su cuenta',
        eventoId,
        sufijo: 'decidio',
        carga: { motivo, quienAbrioSegunElEquipo: evento.quienAbrio, placa: evento.placa },
      }),
    );
  }

  async veredicto(
    evento: EventoDeEquipo,
    copropiedadId: string,
    veredicto: VeredictoRemoto,
    aceptadoPorElEquipo: boolean,
    eventoId: string | null,
    /**
     * F2 (corrección de la 15-L) · del hecho recibido al veredicto aceptado o
     * rechazado por la terminal. Queda en la fila para que el ensayo compare
     * p50/p95 con el plazo de la terminal sin leer registros de texto.
     */
    duracionMs: number,
  ): Promise<void> {
    await this.registro.vivo(
      filaDeEventoDeEquipo(evento, copropiedadId, this.ids, {
        origen: 'plataforma',
        tipo: 'resultado_de_verificacion',
        titulo:
          `Veredicto a la terminal: ${veredicto.permitido ? 'abrir' : 'negar'}` +
          (aceptadoPorElEquipo ? '' : ' (la terminal no lo confirmó)'),
        eventoId,
        sufijo: 'veredicto',
        carga: {
          serie: veredicto.serie,
          permitido: veredicto.permitido,
          motivo: veredicto.motivo,
          aceptadoPorElEquipo,
          duracionMs,
        },
      }),
    );
  }
}

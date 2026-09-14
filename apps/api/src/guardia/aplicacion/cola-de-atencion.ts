import type { EventoRegistrado } from '../../eventos';

/**
 * Cola de atención de la guardia virtual — CU-03, HU-25, KPI-34.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ ORDENA Y POR QUÉ NO ES «LO MÁS RECIENTE PRIMERO»
 *
 * Un tablero muestra lo último. Una cola de atención muestra **lo que lleva más
 * tiempo sin atenderse**, que es lo contrario. Si la guardia virtual ordenara
 * por recencia, el visitante que lleva cuatro minutos esperando bajaría de la
 * pantalla cada vez que llega otro, y el operador atendería siempre al último
 * en llegar. Es el modo de fallo clásico de una bandeja, y en una portería
 * significa dejar a alguien en la calle.
 *
 * Dentro de la misma antigüedad manda la **severidad**: una lectura en lista
 * negra o un sabotaje se atienden antes que un visitante esperando, aunque
 * lleven menos tiempo. Es la única inversión admitida, y es explícita.
 *
 * Función pura con el instante inyectado: la espera se calcula, no se guarda.
 */

export type UrgenciaEnCola = 'critica' | 'normal';

export interface EnAtencion {
  readonly evento: EventoRegistrado;
  /** Segundos que lleva esperando, a `ahora`. */
  readonly esperaSegundos: number;
  readonly urgencia: UrgenciaEnCola;
  /** `true` pasado el umbral de KPI-34: la interfaz lo destaca. */
  readonly demorado: boolean;
}

/** Más allá de esto, la espera deja de ser normal y se señala. */
export const UMBRAL_DE_DEMORA_SEGUNDOS = 60;

/**
 * Motivos que suben un evento al principio de la cola. Son los que describen
 * un riesgo, no una espera: no se atienden «cuando toque».
 */
const MOTIVOS_CRITICOS = new Set(['LISTA_NEGRA', 'CONFIANZA_INSUFICIENTE', 'FALLO_TECNICO']);

export const urgenciaDe = (evento: EventoRegistrado): UrgenciaEnCola =>
  evento.motivo !== null && evento.motivo !== undefined && MOTIVOS_CRITICOS.has(evento.motivo)
    ? 'critica'
    : 'normal';

export const construirCola = (
  eventos: readonly EventoRegistrado[],
  ahora: Date,
  umbralSegundos: number = UMBRAL_DE_DEMORA_SEGUNDOS,
): readonly EnAtencion[] => {
  const conEspera = eventos.map((evento) => {
    const esperaSegundos = Math.max(
      0,
      Math.floor((ahora.getTime() - new Date(evento.ocurridoEn).getTime()) / 1000),
    );
    return {
      evento,
      esperaSegundos,
      urgencia: urgenciaDe(evento),
      demorado: esperaSegundos >= umbralSegundos,
    };
  });

  return [...conEspera].sort((a, b) => {
    // Lo crítico primero, y sólo después la antigüedad. El orden importa: al
    // revés, un sabotaje recién llegado quedaría detrás de cinco visitantes.
    if (a.urgencia !== b.urgencia) return a.urgencia === 'critica' ? -1 : 1;
    return b.esperaSegundos - a.esperaSegundos;
  });
};

/** Lo que la cabecera de la consola necesita para avisar de un vistazo. */
export const resumenDeCola = (
  cola: readonly EnAtencion[],
): { readonly total: number; readonly criticos: number; readonly esperaMaxima: number } => ({
  total: cola.length,
  criticos: cola.filter((e) => e.urgencia === 'critica').length,
  esperaMaxima: cola.reduce((maximo, e) => Math.max(maximo, e.esperaSegundos), 0),
});

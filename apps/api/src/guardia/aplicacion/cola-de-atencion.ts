import {
  DISPARADORES_CRITICOS,
  TIPOS_QUE_TERMINAN_LA_LLAMADA,
  disparadorDeAcceso,
  disparadorDeEventoDeEquipo,
} from '../../eventos';
import type { DisparadorDeAtencion } from '../../eventos';

/**
 * Cola de atención de la guardia virtual y de la portería — CU-03, HU-25,
 * KPI-34, y desde la 15-N lo que el cliente decidió en P-22 (G1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ ENTRA
 *
 * Sólo lo que necesita a una persona y llegó EN VIVO (`disparadores-de-
 * atencion.ts`): la llamada, el rostro o la persona no autorizada, la placa no
 * autorizada, la lista negra y lo dudoso. Ni los permitidos ni el volcado
 * histórico de un equipo. Y sólo mientras está VIGENTE —`GUARDIA_VIGENCIA_EN_
 * COLA_S`, 5 minutos por omisión—: después sale de la cola y queda en Eventos.
 * Sale antes si alguien lo atendió (una orden manual que lo nombra) o, si es
 * una llamada, si el equipo dice que terminó.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUÉ ORDENA Y POR QUÉ NO ES «LO MÁS RECIENTE PRIMERO»
 *
 * Un tablero muestra lo último. Una cola de atención muestra **lo que lleva más
 * tiempo sin atenderse**, que es lo contrario. Si la guardia virtual ordenara
 * por recencia, el visitante que lleva cuatro minutos esperando bajaría de la
 * pantalla cada vez que llega otro. Dentro de la misma antigüedad manda la
 * **severidad**: la lista negra y lo dudoso se atienden antes que una espera,
 * aunque lleven menos tiempo. Es la única inversión admitida, y es explícita.
 *
 * La espera de lo que emite un equipo se cuenta desde que la PLATAFORMA lo
 * supo (recepción), no desde la hora del equipo: un videoportero con el reloj
 * 13 h atrasado (29/09) hacía que todo lo suyo pareciera viejo. La de un acceso
 * cuenta desde su `ocurridoEn`, que con un reloj desviado es ya la recepción
 * (R2). Función pura con el instante inyectado.
 */

export type UrgenciaEnCola = 'critica' | 'normal';

/** Un acceso ya decidido por el motor, como lo lee la cola. */
export interface AccesoReciente {
  readonly id: string;
  readonly ocurridoEn: Date;
  readonly resultado: 'permitido' | 'negado';
  readonly motivo: string | null;
  readonly metodo: string;
  readonly dispositivoId: string;
  readonly viviendaId: string | null;
  readonly placaDetectada: string | null;
  readonly evidenciaId: string | null;
}

/** Un evento de equipo guardado, como lo lee la cola. */
export interface EventoDeEquipoReciente {
  readonly id: string;
  readonly dispositivoId: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly enVivo: boolean;
  readonly origen: 'equipo' | 'plataforma';
  readonly eventoId: string | null;
  readonly recibidoEn: Date;
  /** R2 (15-N) · el motivo del dominio con que el EQUIPO negó, si su código lo dice. */
  readonly motivo?: string | null;
}

/** Lo que la fuente entrega: accesos, eventos de equipo y qué ya se atendió. */
export interface MaterialDeLaCola {
  readonly accesos: readonly AccesoReciente[];
  readonly eventosDeEquipo: readonly EventoDeEquipoReciente[];
  /** Ids (de acceso o de evento de equipo) que una orden manual ya atendió. */
  readonly atendidos: ReadonlySet<string>;
}

export interface EnAtencion {
  /** El id del acceso o del evento de equipo: el que viaja en la orden (`eventoId`). */
  readonly id: string;
  readonly origen: 'acceso' | 'equipo';
  readonly disparador: DisparadorDeAtencion;
  readonly dispositivoId: string;
  readonly llegoEn: Date;
  readonly titulo: string;
  /** Del motor, con un acceso; `null` con un evento de equipo. */
  readonly motivo: string | null;
  readonly resultado: 'permitido' | 'negado' | null;
  readonly viviendaId: string | null;
  readonly placaDetectada: string | null;
  /** Sólo un acceso tiene evidencia que la consola pueda pedir. */
  readonly conEvidencia: boolean;
  /** Segundos que lleva esperando, a `ahora`. */
  readonly esperaSegundos: number;
  readonly urgencia: UrgenciaEnCola;
  /** `true` pasado el umbral de KPI-34: la interfaz lo destaca. */
  readonly demorado: boolean;
}

/** Más allá de esto, la espera deja de ser normal y se señala. */
export const UMBRAL_DE_DEMORA_SEGUNDOS = 60;
/** G1 (15-N) · cuánto sigue en la cola algo sin atender (`GUARDIA_VIGENCIA_EN_COLA_S`). */
export const VIGENCIA_EN_COLA_POR_OMISION_S = 300;

const TITULO_POR_DISPARADOR: Readonly<Record<DisparadorDeAtencion, string>> = {
  llamada: 'Llamada en el videoportero',
  rostro: 'Persona no autorizada',
  placa: 'Placa sin autorización',
  lista_negra: 'Lista negra',
  dudoso: 'El sistema no pudo decidir',
};

export const urgenciaDe = (disparador: DisparadorDeAtencion): UrgenciaEnCola =>
  DISPARADORES_CRITICOS.has(disparador) ? 'critica' : 'normal';

/** La llamada terminó si el MISMO equipo dijo después que se canceló, contestó o colgó. */
const llamadaTerminada = (
  llamada: EventoDeEquipoReciente,
  todos: readonly EventoDeEquipoReciente[],
): boolean =>
  todos.some(
    (e) =>
      e.dispositivoId === llamada.dispositivoId &&
      TIPOS_QUE_TERMINAN_LA_LLAMADA.has(e.tipo) &&
      e.recibidoEn.getTime() >= llamada.recibidoEn.getTime(),
  );

/**
 * Una llamada por equipo: el mismo videoportero la anuncia por `VoiceTalkEvent`
 * y por el 5/51, y un visitante impaciente toca el timbre dos veces. Queda la
 * PRIMERA, porque desde ella se cuenta la espera.
 */
const unaLlamadaPorEquipo = (items: readonly EnAtencion[]): readonly EnAtencion[] => {
  const primera = new Map<string, EnAtencion>();
  for (const i of items) {
    if (i.disparador !== 'llamada') continue;
    const ya = primera.get(i.dispositivoId);
    if (ya === undefined || i.llegoEn.getTime() < ya.llegoEn.getTime()) {
      primera.set(i.dispositivoId, i);
    }
  }
  return items.filter((i) => i.disparador !== 'llamada' || primera.get(i.dispositivoId) === i);
};

export interface OpcionesDeCola {
  readonly vigenciaSegundos?: number;
  readonly umbralSegundos?: number;
}

export const construirCola = (
  material: MaterialDeLaCola,
  ahora: Date,
  opciones: OpcionesDeCola = {},
): readonly EnAtencion[] => {
  const vigencia = opciones.vigenciaSegundos ?? VIGENCIA_EN_COLA_POR_OMISION_S;
  const umbral = opciones.umbralSegundos ?? UMBRAL_DE_DEMORA_SEGUNDOS;
  const espera = (llegoEn: Date): number =>
    Math.max(0, Math.floor((ahora.getTime() - llegoEn.getTime()) / 1000));

  const deAccesos = material.accesos.flatMap((a): EnAtencion[] => {
    const disparador = disparadorDeAcceso(a);
    if (disparador === null || material.atendidos.has(a.id)) return [];
    const esperaSegundos = espera(a.ocurridoEn);
    if (esperaSegundos > vigencia) return [];
    return [
      {
        id: a.id,
        origen: 'acceso',
        disparador,
        dispositivoId: a.dispositivoId,
        llegoEn: a.ocurridoEn,
        titulo: TITULO_POR_DISPARADOR[disparador],
        motivo: a.motivo,
        resultado: a.resultado,
        viviendaId: a.viviendaId,
        placaDetectada: a.placaDetectada,
        conEvidencia: a.evidenciaId !== null,
        esperaSegundos,
        urgencia: urgenciaDe(disparador),
        demorado: esperaSegundos >= umbral,
      },
    ];
  });

  const deEquipos = material.eventosDeEquipo.flatMap((e): EnAtencion[] => {
    const disparador = disparadorDeEventoDeEquipo(e);
    if (disparador === null || material.atendidos.has(e.id)) return [];
    if (e.tipo === 'llamada' && llamadaTerminada(e, material.eventosDeEquipo)) return [];
    const esperaSegundos = espera(e.recibidoEn);
    if (esperaSegundos > vigencia) return [];
    return [
      {
        id: e.id,
        origen: 'equipo',
        disparador,
        dispositivoId: e.dispositivoId,
        llegoEn: e.recibidoEn,
        titulo: e.titulo,
        motivo: e.motivo ?? null,
        resultado: null,
        viviendaId: null,
        placaDetectada: null,
        conEvidencia: false,
        esperaSegundos,
        urgencia: urgenciaDe(disparador),
        demorado: esperaSegundos >= umbral,
      },
    ];
  });

  return [...deAccesos, ...unaLlamadaPorEquipo(deEquipos)].sort((a, b) => {
    // Lo crítico primero, y sólo después la antigüedad. El orden importa: al
    // revés, una lista negra recién llegada quedaría detrás de cinco visitantes.
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

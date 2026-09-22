import type { BloqueDeAlertStream, EventoDeEquipo } from '../hikvision/contratos-de-evento';
import { desdeAlertStreamJson, esEventoEnVivo } from '../hikvision/contratos-de-evento';
import { ClienteDeEquipo } from './cliente';
import type { OpcionesDeEquipo } from './cliente';
import { rutaPara } from './catalogo-de-rutas';

/**
 * ESCUCHA DEL FLUJO DE EVENTOS · terminal facial y videoportero.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL DETALLE QUE ARRUINA UNA PUESTA EN MARCHA, Y AQUÍ ES EL DISEÑO ENTERO
 *
 * El flujo **vuelca todo el historial al conectar**, marcado con
 * `currentEvent: false`, antes de empezar a emitir en tiempo real. Sin
 * filtrarlo, cada timbrazo de las últimas semanas entra como «está llamando
 * ahora»: alertas al operador, residentes avisados de visitas de hace quince
 * días, y eventos falsos en una tabla **append-only que no se puede limpiar**
 * (ADR-05). No es un caso raro: pasa en CADA reconexión.
 *
 * Por eso lo histórico no se descarta en silencio, **se cuenta**. Ese número en
 * el registro del arranque es lo único que distingue «el equipo está mudo» de
 * «el equipo volcó 412 viejos y los tiramos todos».
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA RECONEXIÓN ES PARTE DEL ADAPTADOR, NO DE QUIEN LO USA
 *
 * Un flujo que se mantiene abierto se cae: corte de red, reinicio del equipo,
 * intermediario que corta por inactividad. Con espera creciente **y
 * dispersión**: sin ella, veinte gateways que pierden el mismo conmutador
 * vuelven todos a la vez y tiran lo que acaba de levantarse.
 */

export interface OpcionesDeEscucha extends OpcionesDeEquipo {
  readonly dispositivoId: string;
  readonly familia: 'terminal' | 'videoportero';
  /** Techo de la espera entre reintentos. */
  readonly esperaMaximaMs?: number;
  /** Inyectable: sin esto, una prueba de reconexión tardaría lo que espera. */
  readonly esperar?: (ms: number) => Promise<void>;
  readonly azar?: () => number;
}

export interface ParteDelFlujo {
  readonly evento: EventoDeEquipo | null;
  /** Históricos descartados desde que se abrió la conexión. */
  readonly historicosDescartados: number;
}

const ESPERA_INICIAL_MS = 1000;
const ESPERA_MAXIMA_POR_OMISION_MS = 30_000;

/**
 * Saca los objetos JSON completos de un texto acumulado.
 *
 * El flujo llega en trozos que **no** respetan los límites de los bloques: un
 * objeto puede partirse entre dos lecturas. Se cuentan llaves fuera de cadena
 * —con su escape— y se emite sólo lo que está cerrado; el resto se queda para
 * la siguiente vuelta. Contar llaves a secas partiría cualquier objeto que
 * tuviera una `{` dentro de un texto.
 */
export const extraerObjetos = (
  acumulado: string,
): { readonly objetos: readonly string[]; readonly resto: string } => {
  const objetos: string[] = [];
  let profundidad = 0;
  let inicio = -1;
  let enCadena = false;
  let escapado = false;

  for (let i = 0; i < acumulado.length; i += 1) {
    const c = acumulado[i];
    if (enCadena) {
      if (escapado) escapado = false;
      else if (c === '\\') escapado = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === '{') {
      if (profundidad === 0) inicio = i;
      profundidad += 1;
    } else if (c === '}') {
      profundidad -= 1;
      if (profundidad === 0 && inicio !== -1) {
        objetos.push(acumulado.slice(inicio, i + 1));
        inicio = -1;
      }
      // Una llave de cierre de más es ruido del transporte, no un objeto.
      if (profundidad < 0) profundidad = 0;
    }
  }

  const resto = inicio === -1 ? '' : acumulado.slice(inicio);
  return { objetos, resto };
};

export class EscuchaDeAlertStream {
  private readonly cliente: ClienteDeEquipo;
  private readonly esperar: (ms: number) => Promise<void>;
  private readonly azar: () => number;
  private descartados = 0;

  constructor(private readonly opciones: OpcionesDeEscucha) {
    this.cliente = new ClienteDeEquipo(opciones);
    this.esperar = opciones.esperar ?? ((ms) => new Promise((listo) => setTimeout(listo, ms)));
    this.azar = opciones.azar ?? Math.random;
  }

  /** Cuántos eventos históricos se han descartado en lo que va de proceso. */
  get historicosDescartados(): number {
    return this.descartados;
  }

  /**
   * Emite **sólo lo que ocurre ahora**. Reconecta sola hasta que se cancele.
   *
   * Lo histórico no llega aquí: se cuenta y se tira. Quien consume este
   * iterador no puede equivocarse porque no tiene ocasión de hacerlo — que es
   * mejor que documentar que hay que filtrarlo.
   */
  async *escuchar(cancelar?: AbortSignal): AsyncIterable<EventoDeEquipo> {
    const ruta = rutaPara('escuchar los eventos que el equipo emite', this.opciones.familia);
    let espera = ESPERA_INICIAL_MS;

    while (cancelar === undefined || !cancelar.aborted) {
      try {
        for await (const evento of this.unaConexion(ruta.ruta, cancelar)) {
          // Una conexión que entrega algo es una conexión sana: la espera
          // vuelve al principio. Sin esto, un equipo que se cae cada hora
          // acabaría con una espera de media hora entre reintentos.
          espera = ESPERA_INICIAL_MS;
          yield evento;
        }
      } catch {
        // Cualquier caída es una caída: se reintenta. Distinguirlas aquí no
        // cambiaría lo que hay que hacer.
      }
      if (cancelar !== undefined && cancelar.aborted) return;
      await this.esperar(this.conDispersion(espera));
      espera = Math.min(espera * 2, this.opciones.esperaMaximaMs ?? ESPERA_MAXIMA_POR_OMISION_MS);
    }
  }

  private async *unaConexion(ruta: string, cancelar?: AbortSignal): AsyncIterable<EventoDeEquipo> {
    let acumulado = '';
    for await (const trozo of this.cliente.flujo(ruta, cancelar)) {
      acumulado += trozo;
      const { objetos, resto } = extraerObjetos(acumulado);
      acumulado = resto;

      for (const crudo of objetos) {
        const bloque = this.interpretar(crudo);
        if (bloque === null) continue;
        if (!esEventoEnVivo(bloque)) {
          this.descartados += 1;
          continue;
        }
        yield desdeAlertStreamJson(bloque, this.opciones.dispositivoId, new Date());
      }
    }
  }

  private interpretar(crudo: string): BloqueDeAlertStream | null {
    try {
      const objeto: unknown = JSON.parse(crudo);
      if (typeof objeto !== 'object' || objeto === null) return null;
      // El equipo envuelve el bloque en una clave distinta según el evento.
      const envoltorio = objeto as Record<string, unknown>;
      const interior = envoltorio['EventNotificationAlert'] ?? envoltorio;
      return interior as BloqueDeAlertStream;
    } catch {
      // Un bloque ilegible se tira: un objeto que no analiza no es un evento,
      // y tratarlo como uno escribiría basura en una tabla inmutable.
      return null;
    }
  }

  /** Espera con dispersión: ±25 %, para que las reconexiones no coincidan. */
  private conDispersion(ms: number): number {
    return Math.round(ms * (0.75 + this.azar() * 0.5));
  }
}

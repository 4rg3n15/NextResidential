import type { BloqueDeAlertStream, EventoDeEquipo } from '../hikvision/contratos-de-evento';
import {
  bloqueDesdeXml,
  desdeAlertStreamJson,
  motivoDeDescarte,
} from '../hikvision/contratos-de-evento';
import { ClienteDeEquipo } from './cliente';
import { lectorPara } from './partes-del-flujo';
import type { ParteDelFlujo as ParteCruda } from './partes-del-flujo';
import { recortado, sinSecretos } from './intercambio';
import type { OpcionesDeEquipo } from './cliente';
import { rutaPara } from './catalogo-de-rutas';
import type { RutaDeEquipo } from './catalogo-de-rutas';
import type { CapacidadesDeEquipo } from '../nucleo/capacidades';
import { soporta } from '../nucleo/capacidades';

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

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * DOS FORMAS DE MANTENER EL FLUJO ABIERTO · 6.5, ETAPA 15-D
 *
 * · `alertStream` — un GET que el equipo mantiene abierto y por el que vuelca
 *   TODO, historial incluido. Es el que existía.
 * · `subscribeEvent` — un POST con un cuerpo que dice qué eventos se quieren.
 *   Los dos equipos reales declaran `isSupportSubscribeEvent=true`. Que el
 *   volcado histórico también venga por aquí es lo que se confirma en sitio.
 *
 * Cuál se usa lo decide la CAPACIDAD del equipo (`transporteSegunCapacidades`),
 * no su tipo ni su marca. El filtrado de lo histórico es el mismo para los dos:
 * la trampa de la puesta en marcha no depende del transporte.
 */
export type TransporteDeFlujo = 'alertStream' | 'subscribeEvent';

export const transporteSegunCapacidades = (capacidades: CapacidadesDeEquipo): TransporteDeFlujo =>
  soporta(capacidades, 'suscripcionDeEventos') ? 'subscribeEvent' : 'alertStream';

/**
 * Lo que se pide al suscribirse. DOCUMENTADO, NO VERIFICADO: la forma del
 * cuerpo sale de la documentación de suscripción del fabricante. `all` para
 * que el filtrado lo haga el sistema —que sabe qué clases usa— y no un
 * firmware cuyo vocabulario de tipos varía por modelo.
 */
const CUERPO_DE_SUSCRIPCION =
  '<?xml version="1.0" encoding="UTF-8"?><SubscribeEvent version="2.0" ' +
  'xmlns="http://www.isapi.org/ver20/XMLSchema"><eventMode>all</eventMode></SubscribeEvent>';

export interface OpcionesDeEscucha extends OpcionesDeEquipo {
  readonly dispositivoId: string;
  readonly familia: 'terminal' | 'videoportero';
  /** Por omisión `alertStream`, que es el que existía. */
  readonly transporte?: TransporteDeFlujo;
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

export { extraerObjetos } from './extraer-objetos';

export class EscuchaDeAlertStream {
  private readonly cliente: ClienteDeEquipo;
  private readonly esperar: (ms: number) => Promise<void>;
  private readonly azar: () => number;
  private descartados = 0;

  private readonly ahora: () => number;

  constructor(private readonly opciones: OpcionesDeEscucha) {
    this.cliente = new ClienteDeEquipo(opciones);
    this.ahora = opciones.ahora ?? (() => Date.now());
    this.esperar = opciones.esperar ?? ((ms) => new Promise((listo) => setTimeout(listo, ms)));
    this.azar = opciones.azar ?? Math.random;
  }

  /** El equipo que escucha. Para la bitácora de quien la consume. */
  get dispositivoId(): string {
    return this.opciones.dispositivoId;
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
    const ruta: RutaDeEquipo =
      this.transporte === 'subscribeEvent'
        ? rutaPara('suscribirse a los eventos del equipo', this.opciones.familia)
        : rutaPara('escuchar los eventos que el equipo emite', this.opciones.familia);
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
      } catch (error) {
        // Cualquier caída es una caída: se reintenta. Pero se DICE (H-SITIO-14):
        // en sitio una escucha que no conectaba no dejaba ni una línea.
        if (cancelar === undefined || !cancelar.aborted) {
          this.anotar('aviso', 'escucha: la conexión falló', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      if (cancelar !== undefined && cancelar.aborted) return;
      const esperaConDispersion = this.conDispersion(espera);
      this.anotar('info', 'escucha: se reconecta', { esperaMs: esperaConDispersion });
      await this.esperarSalvoCancelacion(esperaConDispersion, cancelar);
      espera = Math.min(espera * 2, this.opciones.esperaMaximaMs ?? ESPERA_MAXIMA_POR_OMISION_MS);
    }
  }

  /**
   * A4 · la espera entre reintentos termina en el acto si se cancela. Sin
   * esto, `detener()` durante la espera dejaba el bucle vivo hasta medio
   * minuto, y el proceso —o la suite— con un temporizador colgando.
   */
  private esperarSalvoCancelacion(ms: number, cancelar?: AbortSignal): Promise<void> {
    if (cancelar === undefined) return this.esperar(ms);
    if (cancelar.aborted) return Promise.resolve();
    return new Promise((listo) => {
      const alCancelar = (): void => listo();
      cancelar.addEventListener('abort', alCancelar, { once: true });
      void this.esperar(ms).then(() => {
        cancelar.removeEventListener('abort', alCancelar);
        listo();
      });
    });
  }

  /** Qué transporte usa esta escucha. Se enseña en el diagnóstico. */
  get transporte(): TransporteDeFlujo {
    return this.opciones.transporte ?? 'alertStream';
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * H-SITIO-14 · UNA CONEXIÓN, CONTADA ENTERA
   *
   * En sitio, con la suscripción «activa», una persona con rostro registrado
   * pasó por la terminal y no quedó ni una línea. Ahora cada paso deja rastro:
   * la apertura (estado HTTP y tipo), la renegociación del Digest (en el
   * cliente), cada bloque recibido (tipo y tamaño), cada descarte con su motivo
   * y el cierre. Los latidos y las fotos van a `debug`: son ruido esperado.
   */
  private async *unaConexion(ruta: string, cancelar?: AbortSignal): AsyncIterable<EventoDeEquipo> {
    const peticion =
      this.transporte === 'subscribeEvent'
        ? { metodo: 'POST', cuerpo: { tipo: 'application/xml', contenido: CUERPO_DE_SUSCRIPCION } }
        : undefined;
    const abierto = this.ahora();
    const flujo = await this.cliente.abrirFlujoDeEventos(ruta, cancelar, peticion);

    if (flujo.estado < 200 || flujo.estado >= 300) {
      let cuerpo = '';
      for await (const trozo of flujo.trozos) {
        cuerpo += new TextDecoder().decode(trozo);
        if (cuerpo.length > 2048) break;
      }
      this.anotar('error', 'escucha: el equipo rechazó la conexión', {
        estadoHttp: flujo.estado,
        desafioVencido: flujo.desafioVencido,
        cuerpo: recortado(sinSecretos(cuerpo), 512),
      });
      throw new Error(`el equipo contestó HTTP ${String(flujo.estado)} a la escucha`);
    }
    this.anotar('info', 'escucha: conexión abierta', {
      estadoHttp: flujo.estado,
      tipo: flujo.tipo,
      transporte: this.transporte,
    });

    const lector = lectorPara(flujo.tipo);
    let bloques = 0;
    try {
      for await (const trozo of flujo.trozos) {
        for (const parte of lector.alimentar(trozo)) {
          bloques += 1;
          const evento = this.interpretarParte(parte);
          if (evento !== null) yield evento;
        }
      }
    } finally {
      this.anotar('aviso', 'escucha: el equipo cerró el flujo', {
        bloques,
        duracionMs: this.ahora() - abierto,
        bytesSinTerminar: lector.pendientes,
      });
    }
  }

  /** Una parte del flujo: a evento, o a descarte con su motivo. */
  private interpretarParte(parte: ParteCruda): EventoDeEquipo | null {
    const bytes = parte.bytes.byteLength;
    if (parte.tipo.startsWith('image/')) {
      this.anotar('debug', 'escucha: imagen del evento, no se procesa', {
        tipo: parte.tipo,
        bytes,
      });
      return null;
    }
    const texto = new TextDecoder().decode(parte.bytes);
    const esXml = parte.tipo.includes('xml') || /^\s*</.test(texto);
    const bloque = esXml ? bloqueDesdeXml(texto) : this.interpretar(texto);
    if (bloque === 'respuesta_de_suscripcion') {
      this.anotar('info', 'escucha: el equipo confirmó la suscripción', { bytes });
      return null;
    }
    if (bloque === null) {
      this.anotar('aviso', 'escucha: bloque descartado', {
        motivo: esXml ? 'XML sin EventNotificationAlert' : 'ilegible: no es un objeto JSON',
        tipo: parte.tipo,
        bytes,
        inicio: recortado(sinSecretos(texto), 160),
      });
      return null;
    }
    const motivo = motivoDeDescarte(bloque);
    if (motivo === 'latido del equipo') {
      this.anotar('debug', 'escucha: latido del equipo', { bytes });
      return null;
    }
    this.anotar(motivo === null ? 'info' : 'aviso', 'escucha: bloque recibido', {
      tipo: parte.tipo,
      eventType: bloque.eventType ?? null,
      bytes,
      ...(motivo === null ? {} : { descartado: motivo }),
    });
    if (motivo !== null) {
      this.descartados += 1;
      return null;
    }
    return desdeAlertStreamJson(bloque, this.opciones.dispositivoId, new Date());
  }

  private anotar(
    nivel: 'debug' | 'info' | 'aviso' | 'error',
    mensaje: string,
    contexto: Record<string, unknown>,
  ): void {
    this.opciones.traza?.registrar(nivel, mensaje, {
      dispositivoId: this.opciones.dispositivoId,
      familia: this.opciones.familia,
      ...contexto,
    });
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
      // y tratarlo como uno escribiría basura en una tabla inmutable. Desde la
      // 15-K, con su línea en la bitácora.
      return null;
    }
  }

  /** Espera con dispersión: ±25 %, para que las reconexiones no coincidan. */
  private conDispersion(ms: number): number {
    return Math.round(ms * (0.75 + this.azar() * 0.5));
  }
}

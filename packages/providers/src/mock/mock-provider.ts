import type {
  AccessPointProvider,
  EstadoSesionIntercom,
  FaceTemplateProvider,
  IntercomProvider,
  LecturaDePlaca,
  PlateEventSource,
  ResultadoAccionamiento,
  ResultadoDeAccionamiento,
  Vigencia,
} from '@ncr/domain-core';
import { ordenAceptada } from '@ncr/domain-core';
import type { PerfilDeSimulacion } from './simulacion';
import { Azar, FalloDeHardwareSimulado, PERFIL_REALISTA, RelojSimulado } from './simulacion';
import type { CapacidadesDeEquipo } from '../nucleo/capacidades';
import type { EscuchaActiva } from '../nucleo/escucha';
import type { OrigenDeVideo } from '../nucleo/video';
import { CAPACIDADES_COMPLETAS, CAPACIDADES_SIN_CONSULTAR } from '../nucleo/capacidades';
import type { ModoDeSalida, ProveedorDeEquipos } from '../nucleo/proveedor';
import type { VeredictoRemoto } from '../nucleo/verificacion-remota';
import type { NodoDeSalidas } from '../nucleo/salidas';
import { construirArbolDeSalidas } from '../videoportero/arbol-de-salidas';

/** 15-P · lo que «declara» el videoportero simulado: dos cerraduras, sin periféricos. */
const ARBOL_SIMULADO = {
  capacidades:
    '<AccessControl><isSupportOpenDoorParams>true</isSupportOpenDoorParams></AccessControl>',
  ordenRemota:
    '<RemoteControlDoor><doorNo min="1" max="2"/><cmd opt="open,close"/></RemoteControlDoor>',
  unidadesSeguras: null,
  submodulos: null,
};

export interface OpcionesMock {
  readonly perfil?: PerfilDeSimulacion;
  readonly semilla?: number;
  readonly reloj?: RelojSimulado;
  /** Dispositivos que el simulador reconoce. Cualquier otro está fuera de línea. */
  readonly dispositivos?: readonly string[];
  /**
   * 15-K (§4) · además de la lista fija, un equipo que el REGISTRO conoce: sin
   * esto toda orden a un equipo dado de alta en la consola fallaba (ADR-03).
   */
  readonly conocido?: (dispositivoId: string) => Promise<boolean>;
}

/**
 * `MockProvider` — el adaptador que hace cierta la ADR-03: los cuatro puertos
 * con la firma de `HikvisionProvider`; intercambiables sin cambiar una
 * aserción (LSP, KPI-12).
 *
 * Es una única clase y no cuatro porque simula **un equipo**, y el estado que
 * comparte —qué dispositivos existen, qué canal de audio está ocupado— es el
 * mismo estado. Separarlo obligaría a sincronizar cuatro copias de la verdad.
 */
import {
  desdeAlarmServerXml,
  desdeAlertStreamJson,
  soloEnVivo,
} from '../hikvision/contratos-de-evento';
import type { BloqueDeAlertStream } from '../hikvision/contratos-de-evento';

export class MockProvider
  implements
    AccessPointProvider,
    PlateEventSource,
    FaceTemplateProvider,
    IntercomProvider,
    ProveedorDeEquipos
{
  private readonly perfil: PerfilDeSimulacion;
  private readonly azar: Azar;
  private readonly dispositivos: ReadonlySet<string>;
  readonly reloj: RelojSimulado;

  /** Bitácora de lo ocurrido, para que las pruebas afirmen sobre hechos. */
  readonly aperturas: { dispositivoId: string; actorId: string; numeroDePuerta?: number }[] = [];
  /** Bloqueos vigentes por dispositivo (H-3): estado, no pulso. */
  readonly bloqueos = new Map<string, boolean>();
  /** 15-R · P-25 · el modo de cada salida, por `equipo:puerta`. */
  readonly modosDeSalida = new Map<string, ModoDeSalida>();
  /** Veredictos devueltos a terminales que esperaban (A2), para afirmar sobre ellos. */
  readonly veredictos: { dispositivoId: string; veredicto: VeredictoRemoto }[] = [];
  readonly plantillas = new Map<string, Set<string>>();
  /** A2 (15-L) · vigencia con que se cargó cada plantilla, por `equipo:plantilla`. */
  readonly vigenciasEnDispositivo = new Map<string, Vigencia>();
  private readonly suscriptores: ((l: LecturaDePlaca) => Promise<void>)[] = [];

  /** Exclusividad del canal de audio: consecuencia directa de ADR-01. */
  private canalOcupadoPor: string | null = null;
  private dispositivoEnSesion: string | null = null;
  private readonly audioEnviado: Uint8Array[] = [];

  constructor(opciones: OpcionesMock = {}) {
    this.perfil = opciones.perfil ?? PERFIL_REALISTA;
    this.azar = new Azar(opciones.semilla);
    this.reloj = opciones.reloj ?? new RelojSimulado();
    this.dispositivos = new Set(opciones.dispositivos ?? ['disp-porteria', 'disp-talanquera']);
    this.conocido = opciones.conocido;
  }

  private readonly conocido: ((dispositivoId: string) => Promise<boolean>) | undefined;

  /** La lista fija, o lo que el registro conozca. Lo desconocido, nada. */
  private async conoce(dispositivoId: string): Promise<boolean> {
    if (this.dispositivos.has(dispositivoId)) return true;
    return this.conocido === undefined ? false : this.conocido(dispositivoId);
  }

  // ── Capacidades ──────────────────────────────────────────────────────────

  /** El simulado finge un equipo completo: todo `si`. Lo desconocido, nada. */
  async capacidadesDe(dispositivoId: string): Promise<CapacidadesDeEquipo> {
    return (await this.conoce(dispositivoId)) ? CAPACIDADES_COMPLETAS : CAPACIDADES_SIN_CONSULTAR;
  }

  /**
   * A4 · el simulado no tiene flujo que escuchar: sus lecturas entran por la
   * fuente (`entregarLectura`) o por el receptor. Lo dice, y un equipo que no
   * conoce lo rechaza, como el real.
   */
  async escuchar(dispositivoId: string): Promise<EscuchaActiva> {
    if (!(await this.conoce(dispositivoId))) {
      throw new FalloDeHardwareSimulado(dispositivoId, 'escuchar');
    }
    return {
      dispositivoId,
      transporte: 'ninguna',
      detalle:
        'simulado: no hay flujo que escuchar; los eventos entran por la fuente o el receptor',
      detener: () => undefined,
    };
  }

  /** A5 · el simulado no tiene cámara que mostrar; un equipo que no conoce, rechaza. */
  async origenDeVideo(dispositivoId: string): Promise<OrigenDeVideo | null> {
    if (!(await this.conoce(dispositivoId))) {
      throw new FalloDeHardwareSimulado(dispositivoId, 'origenDeVideo');
    }
    return null;
  }

  // ── AccessPointProvider ──────────────────────────────────────────────────

  async abrir(dispositivoId: string, actorId: string): Promise<ResultadoAccionamiento> {
    const latencia = await this.conReintentos(dispositivoId, 'abrir');
    this.aperturas.push({ dispositivoId, actorId });
    return { aceptado: true, latenciaMs: latencia };
  }

  /**
   * 15-P · P3 · el simulado finge un videoportero de dos cerraduras: lo
   * necesario para que el selector de punto de la guardia se vea y se use sin
   * equipo (ADR-03). Lo desconocido, rechaza.
   */
  async salidasDe(dispositivoId: string): Promise<NodoDeSalidas> {
    if (!(await this.conoce(dispositivoId))) {
      throw new FalloDeHardwareSimulado(dispositivoId, 'salidasDe');
    }
    return construirArbolDeSalidas('Equipo simulado', ARBOL_SIMULADO, null);
  }

  async abrirSalida(
    dispositivoId: string,
    numeroDePuerta: number,
    actorId: string,
  ): Promise<ResultadoAccionamiento> {
    const latencia = await this.conReintentos(dispositivoId, 'abrir');
    this.aperturas.push({ dispositivoId, actorId, numeroDePuerta });
    return { aceptado: true, latenciaMs: latencia };
  }

  async fijarModoDeSalida(
    dispositivoId: string,
    numeroDePuerta: number,
    modo: ModoDeSalida,
  ): Promise<ResultadoAccionamiento> {
    const latencia = await this.conReintentos(dispositivoId, 'abrir');
    this.modosDeSalida.set(`${dispositivoId}:${String(numeroDePuerta)}`, modo);
    return { aceptado: true, latenciaMs: latencia };
  }

  async estado(dispositivoId: string): Promise<'en_linea' | 'fuera_de_linea' | 'degradado'> {
    if (!(await this.conoce(dispositivoId))) return 'fuera_de_linea';
    return this.azar.ocurre(this.perfil.probabilidadDeFallo) ? 'degradado' : 'en_linea';
  }

  /**
   * Bloqueo persistente (H-3). El simulado lo GUARDA en vez de olvidarlo: una
   * prueba puede afirmar que el acceso quedó bloqueado, que es el hecho que
   * importa, y no sólo que la orden «pasó».
   */
  async fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento> {
    const latencia = await this.conReintentos(dispositivoId, 'fijarBloqueo');
    this.bloqueos.set(dispositivoId, bloqueado);
    return ordenAceptada(latencia);
  }

  /**
   * A2 · la respuesta a una terminal que espera. El simulado la GUARDA: una
   * prueba afirma que se contestó, con qué veredicto y a qué serie, que es lo
   * que un motor «decorativo» dejaría sin contestar.
   */
  async responderVerificacionRemota(
    dispositivoId: string,
    veredicto: VeredictoRemoto,
  ): Promise<ResultadoAccionamiento> {
    const latencia = await this.conReintentos(dispositivoId, 'responderVerificacionRemota');
    this.veredictos.push({ dispositivoId, veredicto });
    return { aceptado: true, latenciaMs: latencia };
  }

  // ── PlateEventSource ─────────────────────────────────────────────────────

  async suscribir(alLeer: (lectura: LecturaDePlaca) => Promise<void>): Promise<void> {
    this.suscriptores.push(alLeer);
  }

  /**
   * Emite una lectura hacia los suscriptores. **Puede emitirla dos veces**: el
   * hardware real duplica eventos y la ingesta tiene que ser idempotente
   * (RN-17, CA-22). Si el mock nunca duplicara, ese camino no se probaría.
   */
  async emitirLectura(placa: string, dispositivoId: string): Promise<LecturaDePlaca> {
    const bajaConfianza = this.azar.ocurre(this.perfil.probabilidadDeBajaConfianza);
    const lectura: LecturaDePlaca = {
      placa,
      confianza: bajaConfianza ? this.azar.entre(0.3, 0.79) : this.azar.entre(0.85, 0.99),
      dispositivoId,
      ocurridoEn: this.reloj.ahora(),
    };
    const veces = this.azar.ocurre(this.perfil.probabilidadDeDuplicado) ? 2 : 1;
    for (let i = 0; i < veces; i += 1) {
      for (const suscriptor of this.suscriptores) await suscriptor(lectura);
    }
    return lectura;
  }

  /**
   * Emite una lectura **por el camino de la cámara real**: el XML que el equipo
   * POSTea al Alarm Server, por el mismo analizador. Antes se fabricaba el
   * `LecturaDePlaca` directamente y ningún XML se analizaba hasta tener equipo:
   * así la normalización está ejercida desde hoy y la 15 sólo cambia transporte.
   */
  async emitirComoCamaraAnpr(placa: string, dispositivoId: string): Promise<LecturaDePlaca> {
    const ahora = this.reloj.ahora();
    const bajaConfianza = this.azar.ocurre(this.perfil.probabilidadDeBajaConfianza);
    const confianza = bajaConfianza ? this.azar.entre(0.3, 0.79) : this.azar.entre(0.85, 0.99);
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<EventNotificationAlert version="2.0">',
      `  <channelID>1</channelID>`,
      `  <dateTime>${ahora.toISOString()}</dateTime>`,
      '  <eventType>ANPR</eventType>',
      '  <eventState>active</eventState>',
      `  <licensePlate>${placa}</licensePlate>`,
      `  <confidenceLevel>${Math.round(confianza * 100)}</confidenceLevel>`,
      '</EventNotificationAlert>',
    ].join('\n');

    const evento = desdeAlarmServerXml(xml, dispositivoId, ahora);
    if (evento === null || evento.placa === null) {
      throw new Error('el simulado produjo un XML que su propio analizador no entiende');
    }
    return this.difundir({
      placa: evento.placa,
      confianza: evento.confianza ?? confianza,
      dispositivoId,
      ocurridoEn: evento.ocurridoEn,
    });
  }

  /**
   * Emite por el camino del VIDEOPORTERO: el volcado histórico al conectar
   * —`currentEvent: false`— seguido del evento en vivo.
   *
   * Devuelve cuántos históricos se descartaron, porque esa cifra es la que
   * distingue «el videoportero está mudo» de «volcó cuatrocientos eventos
   * viejos y los tiramos todos». Un simulado que solo emitiera el evento bueno
   * nunca ejercitaría el filtro, y el filtro es justo lo que impide inundar una
   * tabla que no admite borrado.
   */
  async emitirComoVideoportero(
    placa: string,
    dispositivoId: string,
    historicos = 3,
  ): Promise<{ readonly lectura: LecturaDePlaca; readonly descartados: number }> {
    const ahora = this.reloj.ahora();
    const volcado: BloqueDeAlertStream[] = [
      ...Array.from({ length: historicos }, (_, i) => ({
        eventType: 'ANPR',
        currentEvent: false,
        dateTime: new Date(ahora.getTime() - (i + 1) * 86_400_000).toISOString(),
        ANPR: { licensePlate: placa, confidenceLevel: 90 },
      })),
      {
        eventType: 'ANPR',
        currentEvent: true,
        dateTime: ahora.toISOString(),
        channelID: 1,
        ANPR: { licensePlate: placa, confidenceLevel: 93 },
      },
    ];

    const { enVivo, descartados } = soloEnVivo(volcado);
    const bloque = enVivo[0];
    if (bloque === undefined) throw new Error('el volcado simulado no dejó ningún evento en vivo');
    const evento = desdeAlertStreamJson(bloque, dispositivoId, ahora);
    const lectura = await this.difundir({
      placa: evento.placa ?? placa,
      confianza: evento.confianza ?? 0.93,
      dispositivoId,
      ocurridoEn: evento.ocurridoEn,
    });
    return { lectura, descartados };
  }

  /** Difunde a los suscriptores, duplicando como lo hace el hardware real. */
  private async difundir(lectura: LecturaDePlaca): Promise<LecturaDePlaca> {
    const veces = this.azar.ocurre(this.perfil.probabilidadDeDuplicado) ? 2 : 1;
    for (let i = 0; i < veces; i += 1) {
      for (const suscriptor of this.suscriptores) await suscriptor(lectura);
    }
    return lectura;
  }

  // ── FaceTemplateProvider ─────────────────────────────────────────────────

  async sincronizar(
    dispositivoId: string,
    plantillaId: string,
    plantilla: Uint8Array,
    vigencia?: Vigencia,
  ): Promise<void> {
    // Una plantilla vacía no es un caso raro: es lo que llega cuando la captura
    // falló y nadie lo comprobó. Sincronizarla dejaría una plantilla inservible
    // en la terminal y un reconocimiento que nunca acierta (RN-11).
    if (plantilla.length === 0) {
      throw new FalloDeHardwareSimulado(dispositivoId, 'sincronizar: plantilla vacía');
    }
    await this.conReintentos(dispositivoId, 'sincronizar');
    const enDispositivo = this.plantillas.get(dispositivoId) ?? new Set<string>();
    enDispositivo.add(plantillaId);
    this.plantillas.set(dispositivoId, enDispositivo);
    // A2 (15-L) · lo que el equipo real guardaría como `Valid`, a la vista.
    if (vigencia === undefined)
      this.vigenciasEnDispositivo.delete(`${dispositivoId}:${plantillaId}`);
    else this.vigenciasEnDispositivo.set(`${dispositivoId}:${plantillaId}`, vigencia);
  }

  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    await this.conReintentos(dispositivoId, 'suprimir');
    this.plantillas.get(dispositivoId)?.delete(plantillaId);
    this.vigenciasEnDispositivo.delete(`${dispositivoId}:${plantillaId}`);
  }

  // ── IntercomProvider ─────────────────────────────────────────────────────

  /**
   * ADR-01 · Un canal TwoWayAudio suele ser **exclusivo**. El segundo operador
   * no recibe un error: recibe `en_espera`, que es lo que la consola necesita
   * para mostrar una cola en vez de un fallo (ETAPA 10).
   */
  async abrirSesion(dispositivoId: string, operadorId: string): Promise<EstadoSesionIntercom> {
    await this.conReintentos(dispositivoId, 'abrirSesion');
    if (this.canalOcupadoPor !== null && this.canalOcupadoPor !== operadorId) return 'en_espera';
    this.canalOcupadoPor = operadorId;
    this.dispositivoEnSesion = dispositivoId;
    return 'abierta';
  }

  async enviarAudio(fragmento: Uint8Array): Promise<void> {
    if (this.canalOcupadoPor === null) {
      throw new FalloDeHardwareSimulado('(sin sesión)', 'enviarAudio');
    }
    this.audioEnviado.push(fragmento);
  }

  async *recibirAudio(): AsyncIterable<Uint8Array> {
    // Eco: el simulado devuelve lo que se le envió, que es suficiente para
    // ejercitar el puente hacia el navegador sin inventar un códec.
    for (const fragmento of this.audioEnviado) yield fragmento;
  }

  async cerrarSesion(motivo: string): Promise<void> {
    if (motivo.trim().length === 0) {
      throw new FalloDeHardwareSimulado(this.dispositivoEnSesion ?? '(ninguno)', 'cerrarSesion');
    }
    this.canalOcupadoPor = null;
    this.dispositivoEnSesion = null;
  }

  async estadoSesion(): Promise<EstadoSesionIntercom> {
    return this.canalOcupadoPor === null ? 'cerrada' : 'abierta';
  }

  // ── Interno ──────────────────────────────────────────────────────────────

  /**
   * Latencia y fallo transitorio con reintento. Devuelve la latencia ACUMULADA:
   * lo que mediría un cronómetro, incluidos los intentos que fallaron. Es la
   * cifra que importa para KPI-13 y KPI-32, no la del intento afortunado.
   */
  private async conReintentos(dispositivoId: string, operacion: string): Promise<number> {
    if (!(await this.conoce(dispositivoId))) {
      throw new FalloDeHardwareSimulado(dispositivoId, operacion);
    }
    let acumulada = 0;
    for (let intento = 1; intento <= this.perfil.intentos; intento += 1) {
      const latencia = Math.round(
        this.azar.entre(this.perfil.latenciaMsMin, this.perfil.latenciaMsMax),
      );
      acumulada += latencia;
      this.reloj.avanzar(latencia);
      if (!this.azar.ocurre(this.perfil.probabilidadDeFallo)) return acumulada;
    }
    throw new FalloDeHardwareSimulado(dispositivoId, operacion);
  }
}

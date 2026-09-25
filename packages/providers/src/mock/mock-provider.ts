import type {
  AccessPointProvider,
  EstadoSesionIntercom,
  FaceTemplateProvider,
  IntercomProvider,
  LecturaDePlaca,
  PlateEventSource,
  ResultadoAccionamiento,
  ResultadoDeAccionamiento,
} from '@ncr/domain-core';
import { ordenAceptada } from '@ncr/domain-core';
import type { PerfilDeSimulacion } from './simulacion';
import { Azar, FalloDeHardwareSimulado, PERFIL_REALISTA, RelojSimulado } from './simulacion';
import type { CapacidadesDeEquipo } from '../nucleo/capacidades';
import { CAPACIDADES_COMPLETAS, CAPACIDADES_SIN_CONSULTAR } from '../nucleo/capacidades';
import type { ProveedorDeEquipos } from '../nucleo/proveedor';
import type { VeredictoRemoto } from '../nucleo/verificacion-remota';

export interface OpcionesMock {
  readonly perfil?: PerfilDeSimulacion;
  readonly semilla?: number;
  readonly reloj?: RelojSimulado;
  /** Dispositivos que el simulador reconoce. Cualquier otro está fuera de línea. */
  readonly dispositivos?: readonly string[];
}

/**
 * `MockProvider` — el adaptador que hace cierta la ADR-03.
 *
 * Implementa **los cuatro puertos de proveedor** con la misma firma que
 * implementará `HikvisionProvider` en la ETAPA 15. Que sean intercambiables sin
 * cambiar una sola aserción es la verificación de LSP (§2.3) y de KPI-12: la
 * suite completa corre sin hardware.
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
  readonly aperturas: { dispositivoId: string; actorId: string }[] = [];
  /** Bloqueos vigentes por dispositivo (H-3): estado, no pulso. */
  readonly bloqueos = new Map<string, boolean>();
  /** Veredictos devueltos a terminales que esperaban (A2), para afirmar sobre ellos. */
  readonly veredictos: { dispositivoId: string; veredicto: VeredictoRemoto }[] = [];
  readonly plantillas = new Map<string, Set<string>>();
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
  }

  // ── Capacidades ──────────────────────────────────────────────────────────

  /** El simulado finge un equipo completo: todo `si`. Lo desconocido, nada. */
  async capacidadesDe(dispositivoId: string): Promise<CapacidadesDeEquipo> {
    return this.dispositivos.has(dispositivoId) ? CAPACIDADES_COMPLETAS : CAPACIDADES_SIN_CONSULTAR;
  }

  // ── AccessPointProvider ──────────────────────────────────────────────────

  async abrir(dispositivoId: string, actorId: string): Promise<ResultadoAccionamiento> {
    const latencia = await this.conReintentos(dispositivoId, 'abrir');
    this.aperturas.push({ dispositivoId, actorId });
    return { aceptado: true, latenciaMs: latencia };
  }

  async estado(dispositivoId: string): Promise<'en_linea' | 'fuera_de_linea' | 'degradado'> {
    if (!this.dispositivos.has(dispositivoId)) return 'fuera_de_linea';
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
   * Emite una lectura **por el camino de la cámara real**: construye el XML que
   * el equipo POSTea al Alarm Server y lo hace pasar por el mismo analizador
   * que usará la ETAPA 15.
   *
   * POR QUÉ, y es la diferencia entre un simulado útil y uno decorativo: hasta
   * ahora `emitirLectura` fabricaba directamente un `LecturaDePlaca` —la forma
   * de salida—, así que la suite completa corría sin que nadie hubiera
   * analizado nunca un XML. El día que llegara el equipo, el analizador sería
   * código recién escrito estrenándose contra hardware. Ahora la normalización
   * está ejercida desde hoy, y lo que la 15 sustituye es el transporte.
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
  }

  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    await this.conReintentos(dispositivoId, 'suprimir');
    this.plantillas.get(dispositivoId)?.delete(plantillaId);
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
    if (!this.dispositivos.has(dispositivoId)) {
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

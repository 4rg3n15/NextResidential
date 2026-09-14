import type {
  AccessPointProvider,
  EstadoSesionIntercom,
  FaceTemplateProvider,
  IntercomProvider,
  LecturaDePlaca,
  PlateEventSource,
  ResultadoAccionamiento,
} from '@ncr/domain-core';
import type { PerfilDeSimulacion } from './simulacion';
import { Azar, FalloDeHardwareSimulado, PERFIL_REALISTA, RelojSimulado } from './simulacion';
import type { EventoAnpr } from '../anpr/evento-anpr';
import { analizarPaqueteAnpr } from '../anpr/paquete-anpr';
import { construirPaqueteAnpr } from '../anpr/emisor-anpr';

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
export class MockProvider
  implements AccessPointProvider, PlateEventSource, FaceTemplateProvider, IntercomProvider
{
  private readonly perfil: PerfilDeSimulacion;
  private readonly azar: Azar;
  private readonly dispositivos: ReadonlySet<string>;
  readonly reloj: RelojSimulado;

  /** Bitácora de lo ocurrido, para que las pruebas afirmen sobre hechos. */
  readonly aperturas: { dispositivoId: string; actorId: string }[] = [];
  readonly plantillas = new Map<string, Set<string>>();
  private readonly suscriptores: ((l: LecturaDePlaca) => Promise<void>)[] = [];

  /** Exclusividad del canal de audio: consecuencia directa de ADR-01. */
  private eventosEmitidos = 0;
  private canalOcupadoPor: string | null = null;
  private dispositivoEnSesion: string | null = null;
  private readonly audioEnviado: Uint8Array[] = [];

  constructor(opciones: OpcionesMock = {}) {
    this.perfil = opciones.perfil ?? PERFIL_REALISTA;
    this.azar = new Azar(opciones.semilla);
    this.reloj = opciones.reloj ?? new RelojSimulado();
    this.dispositivos = new Set(opciones.dispositivos ?? ['disp-porteria', 'disp-talanquera']);
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

  // ── PlateEventSource ─────────────────────────────────────────────────────

  async suscribir(alLeer: (lectura: LecturaDePlaca) => Promise<void>): Promise<void> {
    this.suscriptores.push(alLeer);
  }

  /**
   * Emite una lectura hacia los suscriptores. **Puede emitirla dos veces**: el
   * hardware real duplica eventos y la ingesta tiene que ser idempotente
   * (RN-17, CA-22). Si el mock nunca duplicara, ese camino no se probaría.
   *
   * **La lectura NO se inventa: se construye con la forma del equipo real y se
   * vuelve a leer con el mismo analizador** que usará el adaptador de la ETAPA
   * 15 (`construirPaqueteAnpr` → `analizarPaqueteAnpr`). Antes el simulador
   * producía directamente el objeto que le convenía, y eso dejaba sin ejercer
   * justo lo que cuesta: el desfase horario, el identificador propio del
   * evento, el delimitador del envío y la confianza en centésimas. Ahora el
   * camino simulado y el real comparten el normalizador.
   */
  async emitirLectura(placa: string, dispositivoId: string): Promise<LecturaDePlaca> {
    return (await this.emitirEventoAnpr(placa, dispositivoId)).lectura;
  }

  /**
   * Lo mismo, devolviendo **también el evento completo del equipo**.
   *
   * Existe porque `LecturaDePlaca` —el puerto del dominio— no tiene dónde
   * llevar el identificador propio del evento ni la hora del equipo, y esos dos
   * datos son los que sostienen RN-17 y CA-21. Quien los necesite los toma de
   * aquí; el puerto sigue diciendo lo que el dominio necesita saber, que es
   * placa, confianza, equipo e instante.
   */
  async emitirEventoAnpr(
    placa: string,
    dispositivoId: string,
  ): Promise<{ readonly lectura: LecturaDePlaca; readonly evento: EventoAnpr }> {
    const bajaConfianza = this.azar.ocurre(this.perfil.probabilidadDeBajaConfianza);
    // En CENTÉSIMAS enteras, que es la resolución que da el equipo: no tiene
    // sentido que el simulador ofrezca más precisión de la que existe.
    const confianzaCentesimas = Math.round(
      (bajaConfianza ? this.azar.entre(0.3, 0.79) : this.azar.entre(0.85, 0.99)) * 100,
    );

    const { cuerpo, tipoDeContenido } = construirPaqueteAnpr({
      placa,
      confianzaCentesimas,
      ocurridoEn: this.reloj.ahora(),
      referenciaExterna: this.siguienteReferencia(dispositivoId),
    });

    const paquete = analizarPaqueteAnpr(cuerpo, tipoDeContenido);
    if (!paquete.ok) {
      // Si esto salta, el simulador y el analizador se han separado: es un
      // defecto del propio simulador y callarlo dejaría el camino sin ejercer.
      throw new FalloDeHardwareSimulado(dispositivoId, paquete.error.detalle);
    }
    const evento = paquete.valor.evento;

    const lectura: LecturaDePlaca = {
      placa: evento.placa,
      confianza: evento.confianzaCentesimas / 100,
      dispositivoId,
      ocurridoEn: evento.ocurridoEn,
    };
    const veces = this.azar.ocurre(this.perfil.probabilidadDeDuplicado) ? 2 : 1;
    for (let i = 0; i < veces; i += 1) {
      for (const suscriptor of this.suscriptores) await suscriptor(lectura);
    }
    return { lectura, evento };
  }

  /** Identificador de evento del equipo, reproducible con la misma semilla. */
  private siguienteReferencia(dispositivoId: string): string {
    this.eventosEmitidos += 1;
    return `${dispositivoId}-${String(this.eventosEmitidos).padStart(6, '0')}`;
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

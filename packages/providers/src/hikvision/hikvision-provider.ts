import type {
  AccessPointProvider,
  EstadoSesionIntercom,
  FaceTemplateProvider,
  IntercomProvider,
  LecturaDePlaca,
  PlateEventSource,
  Reloj,
  ResultadoAccionamiento,
} from '@ncr/domain-core';
import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import { ControlDeBarreraVehicular } from '../barrera/control-barrera';
import { TerminalFacial } from '../terminal/terminal-facial';
import { Videoportero } from '../videoportero/videoportero';
import { IntercomDeEquipo } from '../videoportero/intercom-equipo';
import { EquipoDecidePorSuCuenta } from '../camara/modo-de-control';
import { leerVeredictoDeControl } from '../camara/veredicto-de-control';
import { leerDisparador } from '../camara/disparadores-vinculados';
import { EquipoNoRegistrado } from './registro-de-equipos';
import type { EquipoRegistrado, RegistroDeEquipos } from './registro-de-equipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `HikvisionProvider` · UNA CLASE, LOS CUATRO PUERTOS
 *
 * Misma firma exacta que `MockProvider`. Es la condición de LSP (§2.3) y de
 * KPI-12: la suite de contrato corre contra los dos **sin una sola rama por
 * implementación**, y si hiciera falta un `if (esMock)` no serían
 * intercambiables y el arreglo iría en el adaptador, no en la prueba.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NO REIMPLEMENTA PROTOCOLO. RESUELVE Y DELEGA
 *
 * Los adaptadores de cada familia ya existen y están probados. Esta clase hace
 * lo único que faltaba: **resolver el equipo por su identificador** contra el
 * registro que la consola alimenta, y delegar. Reescribir aquí lo que ya hacen
 * habría producido dos implementaciones del mismo protocolo divergiendo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA GUARDA QUE NO SE NEGOCIA
 *
 * Antes de aceptar un equipo de tipo cámara se exige el veredicto COMPLETO:
 * modo de control, políticas internas y disparadores vinculados. Si alguna de
 * las tres vías dice que el equipo abre por su cuenta, se lanza
 * `EquipoDecidePorSuCuenta` con el detalle de qué campo falla.
 *
 * **Que el sistema pueda corregirlo desde la consola NO relaja la guarda.**
 * Poder arreglarlo y estar arreglado son cosas distintas, y operar mientras
 * tanto produce un histórico que afirma que nosotros decidimos cuando no fue
 * así. Hasta que el equipo esté conforme, se niega.
 *
 * El veredicto se calcula **una vez por dispositivo** y se recuerda: es una
 * comprobación de arranque, no un peaje por cada apertura. Cambiar la
 * configuración del equipo exige darlo de alta otra vez, que es exactamente
 * cuando se quiere volver a comprobar.
 */

export interface OpcionesDeHikvision {
  readonly registro: RegistroDeEquipos;
  readonly reloj: Reloj;
  /** Inyectable para que la suite corra **sin red y sin equipo** (ADR-03). */
  readonly peticion?: typeof fetch;
  /** La fuente por la que entran las placas. Se comparte con el receptor. */
  readonly fuente?: FuenteDePlacas;
  /**
   * `false` **sólo** en pruebas que no van contra una cámara. Nunca en
   * producción: es la guarda del principio rector.
   */
  readonly exigirVeredictoDeControl?: boolean;
}

export class HikvisionProvider
  implements AccessPointProvider, PlateEventSource, FaceTemplateProvider, IntercomProvider
{
  private readonly fuente: FuenteDePlacas;
  private readonly aprobados = new Set<string>();
  private readonly puertas = new Map<string, AccessPointProvider>();
  private readonly terminales = new Map<string, TerminalFacial>();
  private readonly intercomos = new Map<string, IntercomDeEquipo>();
  private enSesion: string | null = null;

  constructor(private readonly opciones: OpcionesDeHikvision) {
    this.fuente = opciones.fuente ?? new FuenteDePlacas();
  }

  /** La fuente de placas, para que el receptor publique en ella. */
  get fuenteDePlacas(): FuenteDePlacas {
    return this.fuente;
  }

  // ── AccessPointProvider ──────────────────────────────────────────────────

  async abrir(dispositivoId: string, actorId: string): Promise<ResultadoAccionamiento> {
    const equipo = await this.resolver(dispositivoId);
    await this.exigirQueNoDecidaSolo(equipo);
    const puerta = this.puertaDe(equipo);

    if (equipo.tipo === 'camara_lpr' || equipo.tipo === 'rele') {
      // La barrera implementa el puerto del dominio con otra forma de
      // resultado: `aceptada` / `rechazada` / `inalcanzable`. Se traduce aquí y
      // no se filtra hacia fuera, porque el puerto del dominio es el contrato.
      const barrera = puerta as unknown as ControlDeBarreraVehicular;
      const resultado = await barrera.accionar(dispositivoId, true);
      // H-1 · `aceptada` NO afirma que el vehículo pasara. El puerto tampoco lo
      // afirma: dice que la orden se aceptó.
      return { aceptado: resultado.estado === 'aceptada', latenciaMs: resultado.latenciaMs };
    }
    return puerta.abrir(dispositivoId, actorId);
  }

  async estado(dispositivoId: string): Promise<'en_linea' | 'fuera_de_linea' | 'degradado'> {
    const equipo = await this.buscar(dispositivoId);
    if (equipo === null) return 'fuera_de_linea';

    const ruta = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'comun');
    try {
      const respuesta = await this.cliente(equipo).pedir(ruta.metodo, ruta.ruta);
      // Contesta pero rechaza: está vivo y mal configurado. `degradado` lo
      // separa de «no contesta», que se resuelve llamando al técnico.
      if (respuesta.estado === 401 || respuesta.estado === 403) return 'degradado';
      return respuesta.ok ? 'en_linea' : 'degradado';
    } catch {
      return 'fuera_de_linea';
    }
  }

  // ── PlateEventSource ─────────────────────────────────────────────────────

  /**
   * El puerto que la ETAPA 05 declaró y nadie implementaba. Los dos
   * transportes —armado y escucha— convergen en esta misma fuente.
   */
  async suscribir(alLeer: (lectura: LecturaDePlaca) => Promise<void>): Promise<void> {
    await this.fuente.suscribir(alLeer);
  }

  // ── FaceTemplateProvider ─────────────────────────────────────────────────

  async sincronizar(
    dispositivoId: string,
    plantillaId: string,
    plantilla: Uint8Array,
  ): Promise<void> {
    const terminal = await this.terminalDe(dispositivoId);
    await terminal.sincronizar(dispositivoId, plantillaId, plantilla);
  }

  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    const terminal = await this.terminalDe(dispositivoId);
    await terminal.suprimir(dispositivoId, plantillaId);
  }

  // ── IntercomProvider ─────────────────────────────────────────────────────

  async abrirSesion(dispositivoId: string, operadorId: string): Promise<EstadoSesionIntercom> {
    const intercom = await this.intercomDe(dispositivoId);
    const estado = await intercom.abrirSesion(dispositivoId, operadorId);
    if (estado === 'abierta') this.enSesion = dispositivoId;
    return estado;
  }

  async enviarAudio(fragmento: Uint8Array): Promise<void> {
    await this.enSesionActual().enviarAudio(fragmento);
  }

  recibirAudio(): AsyncIterable<Uint8Array> {
    return this.enSesionActual().recibirAudio();
  }

  async cerrarSesion(motivo: string): Promise<void> {
    if (this.enSesion === null) return;
    const intercom = this.intercomos.get(this.enSesion);
    this.enSesion = null;
    if (intercom !== undefined) await intercom.cerrarSesion(motivo);
  }

  async estadoSesion(): Promise<EstadoSesionIntercom> {
    if (this.enSesion === null) return 'cerrada';
    return (this.intercomos.get(this.enSesion) ?? null)?.estadoSesion() ?? 'cerrada';
  }

  // ── Interno ──────────────────────────────────────────────────────────────

  private enSesionActual(): IntercomDeEquipo {
    const intercom = this.enSesion === null ? undefined : this.intercomos.get(this.enSesion);
    if (intercom === undefined) {
      throw new Error('No hay ninguna sesión de audio abierta contra un equipo');
    }
    return intercom;
  }

  private async buscar(dispositivoId: string): Promise<EquipoRegistrado | null> {
    return this.opciones.registro.buscar(dispositivoId);
  }

  private async resolver(dispositivoId: string): Promise<EquipoRegistrado> {
    const equipo = await this.buscar(dispositivoId);
    if (equipo === null) throw new EquipoNoRegistrado(dispositivoId);
    return equipo;
  }

  private cliente(equipo: EquipoRegistrado): ClienteDeEquipo {
    return new ClienteDeEquipo(this.conexionDe(equipo));
  }

  private conexionDe(equipo: EquipoRegistrado): {
    host: string;
    puerto: number;
    protocolo: 'http' | 'https';
    usuario: string;
    clave: string;
    peticion?: typeof fetch;
  } {
    return {
      host: equipo.host,
      puerto: equipo.puerto,
      protocolo: equipo.protocolo,
      usuario: equipo.usuario,
      clave: equipo.clave,
      ...(this.opciones.peticion === undefined ? {} : { peticion: this.opciones.peticion }),
    };
  }

  /**
   * La guarda del principio rector. Se hace **una vez por dispositivo**.
   *
   * Un equipo inalcanzable NO se da por bueno: no poder comprobarlo es no
   * saberlo, y la dirección segura de este proyecto es la misma en todas
   * partes. Lanza `EquipoInalcanzable`, que quien llama ya sabe tratar.
   */
  private async exigirQueNoDecidaSolo(equipo: EquipoRegistrado): Promise<void> {
    if (equipo.tipo !== 'camara_lpr') return;
    if (this.opciones.exigirVeredictoDeControl === false) return;
    if (this.aprobados.has(equipo.dispositivoId)) return;

    const cliente = this.cliente(equipo);
    const control = rutaPara('leer quién controla la barrera: la cámara o la plataforma', 'camara');
    const respuesta = await cliente.pedir(control.metodo, control.ruta);
    const veredicto = leerVeredictoDeControl(respuesta.ok ? respuesta.cuerpo : '');

    // La TERCERA vía: un disparador vinculado con acción de E/S abre el relé
    // valga lo que valga el modo de control. Que esta consulta falle no se
    // trata como conforme — se trata como no comprobado, que bloquea igual.
    const disparador = rutaPara('leer si un disparador vinculado acciona la barrera', 'camara');
    let abrePorDisparador = true;
    let detalleDelDisparador = 'no se pudo leer el disparador de detección';
    try {
      const r = await cliente.pedir(disparador.metodo, disparador.ruta);
      const leido = leerDisparador(r.ok ? r.cuerpo : '');
      abrePorDisparador = !leido.leido || leido.abrePorSuCuenta;
      detalleDelDisparador = leido.detalle;
    } catch (error) {
      if (!(error instanceof EquipoInalcanzable)) throw error;
    }

    if (!veredicto.admisible || abrePorDisparador) {
      throw new EquipoDecidePorSuCuenta(veredicto.modo, [
        ...veredicto.bloqueos.map((b) => `${b.campo}: ${b.detalle}`),
        ...(abrePorDisparador ? [detalleDelDisparador] : []),
      ]);
    }
    this.aprobados.add(equipo.dispositivoId);
  }

  private puertaDe(equipo: EquipoRegistrado): AccessPointProvider {
    const guardado = this.puertas.get(equipo.dispositivoId);
    if (guardado !== undefined) return guardado;

    const conexion = this.conexionDe(equipo);
    const creado: AccessPointProvider =
      equipo.tipo === 'camara_lpr' || equipo.tipo === 'rele'
        ? (new ControlDeBarreraVehicular(conexion) as unknown as AccessPointProvider)
        : equipo.tipo === 'terminal_facial'
          ? new TerminalFacial({ ...conexion, modo: equipo.modoDeTerminal ?? 'decide_el_equipo' })
          : new Videoportero(conexion);

    this.puertas.set(equipo.dispositivoId, creado);
    return creado;
  }

  private async terminalDe(dispositivoId: string): Promise<TerminalFacial> {
    const guardado = this.terminales.get(dispositivoId);
    if (guardado !== undefined) return guardado;

    const equipo = await this.resolver(dispositivoId);
    if (equipo.tipo !== 'terminal_facial') {
      throw new Error(
        `El equipo ${dispositivoId} no es una terminal facial (${equipo.tipo}): sincronizar ` +
          'una plantilla contra otro aparato dejaría el dato biométrico donde nadie lo busca',
      );
    }
    const creado = new TerminalFacial({
      ...this.conexionDe(equipo),
      modo: equipo.modoDeTerminal ?? 'decide_el_equipo',
    });
    this.terminales.set(dispositivoId, creado);
    return creado;
  }

  private async intercomDe(dispositivoId: string): Promise<IntercomDeEquipo> {
    const guardado = this.intercomos.get(dispositivoId);
    if (guardado !== undefined) return guardado;

    const equipo = await this.resolver(dispositivoId);
    const creado = new IntercomDeEquipo({
      ...this.conexionDe(equipo),
      reloj: this.opciones.reloj,
      canalHabilitado: equipo.canalDeAudioHabilitado ?? false,
    });
    this.intercomos.set(dispositivoId, creado);
    return creado;
  }
}

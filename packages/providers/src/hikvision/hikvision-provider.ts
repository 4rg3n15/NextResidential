import type {
  AccessPointProvider,
  EstadoSesionIntercom,
  FaceTemplateProvider,
  IntercomProvider,
  LecturaDePlaca,
  PlateEventSource,
  Reloj,
  ResultadoAccionamiento,
  ResultadoDeAccionamiento,
} from '@ncr/domain-core';
import { ordenInalcanzable } from '@ncr/domain-core';
import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import { ControlDeBarreraVehicular } from '../barrera/control-barrera';
import { TerminalFacial } from '../terminal/terminal-facial';
import { Videoportero } from '../videoportero/videoportero';
import { IntercomDeEquipo } from '../videoportero/intercom-equipo';
import { EscuchaDeAlertStream, transporteSegunCapacidades } from '../equipo/escucha-alertstream';
import type { EscuchaActiva } from '../nucleo/escucha';
import { EquipoDecidePorSuCuenta } from '../camara/modo-de-control';
import { leerVeredictoDeControl } from '../camara/veredicto-de-control';
import { leerDisparador } from '../camara/disparadores-vinculados';
import { EquipoNoRegistrado } from './registro-de-equipos';
import type { EquipoRegistrado, RegistroDeEquipos } from './registro-de-equipos';
import { descubrirCapacidades } from './capacidades-hikvision';
import { CARRIL_VERIFICADO_DE_LA_CAMARA } from '../camara/carril';
import type { CapacidadesDeEquipo, NombreDeCapacidad } from '../nucleo/capacidades';
import { CAPACIDADES_SIN_CONSULTAR, estadoDe, soporta } from '../nucleo/capacidades';
import { CapacidadNoSoportada } from '../nucleo/errores';
import type { ProveedorDeEquipos } from '../nucleo/proveedor';
import type { VeredictoRemoto } from '../nucleo/verificacion-remota';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `HikvisionProvider` · UNA CLASE, LOS CUATRO PUERTOS
 *
 * Misma firma exacta que `MockProvider` y que el adaptador ficticio. Es la
 * condición de LSP (§2.3) y de KPI-12: la suite de contrato corre contra los
 * tres **sin una sola rama por implementación**.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NO REIMPLEMENTA PROTOCOLO. RESUELVE Y DELEGA
 *
 * Los adaptadores de cada familia ya existen y están probados. Esta clase hace
 * lo único que faltaba: **resolver el equipo por su identificador** contra el
 * registro que la consola alimenta, y delegar.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DESDE LA 15-D DECIDE POR CAPACIDADES, NO POR TIPO (O2, D2)
 *
 * Antes: «si es cámara, exige veredicto; si es terminal, sincroniza; si es
 * intercom, abre canal». El tipo es una palabra de un formulario. Ahora cada
 * operación pregunta primero `capacidadesDe(dispositivo)` —persistidas por la
 * consola o descubiertas del aparato UNA vez por proceso— y niega con
 * `CapacidadNoSoportada` lo que el equipo no declara. `desconocida` cuenta
 * como no, y el motivo lo dice.
 *
 * Y la guarda del principio rector alcanza a **los tres tipos** (D2):
 *
 * | Equipo        | Cómo podría decidir solo                 | Qué se exige                          |
 * | ------------- | ---------------------------------------- | ------------------------------------- |
 * | Cámara        | ctrlMode ≠ 1, lista blanca, disparador   | El veredicto COMPLETO (15-C)          |
 * | Terminal      | Reconoce y abre sin preguntar            | `verificacionRemota = si` si se declaró `reporta_y_espera` |
 * | Videoportero  | No decide: reporta y abre por orden      | `aperturaRemota = si` para abrir      |
 *
 * En `decide_el_equipo` la terminal se acepta **porque se declaró así**: es el
 * modo débil, está documentado, y el sistema gobierna sólo qué plantillas hay.
 *
 * El veredicto se calcula **una vez por dispositivo** y se recuerda: es una
 * comprobación de arranque, no un peaje por cada apertura.
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

const FAMILIA_DE: Record<EquipoRegistrado['tipo'], 'camara' | 'terminal' | 'videoportero'> = {
  camara_lpr: 'camara',
  rele: 'camara',
  controlador_io: 'camara',
  terminal_facial: 'terminal',
  intercom: 'videoportero',
};

export class HikvisionProvider
  implements
    AccessPointProvider,
    PlateEventSource,
    FaceTemplateProvider,
    IntercomProvider,
    ProveedorDeEquipos
{
  private readonly fuente: FuenteDePlacas;
  private readonly aprobados = new Set<string>();
  private readonly capacidades = new Map<string, CapacidadesDeEquipo>();
  private readonly puertas = new Map<string, AccessPointProvider>();
  private readonly terminales = new Map<string, TerminalFacial>();
  private readonly intercomos = new Map<string, IntercomDeEquipo>();
  /** A4 · escuchas abiertas, una por equipo. */
  private readonly escuchas = new Map<string, EscuchaActiva>();
  private enSesion: string | null = null;

  constructor(private readonly opciones: OpcionesDeHikvision) {
    this.fuente = opciones.fuente ?? new FuenteDePlacas();
  }

  /** La fuente de placas, para que el receptor publique en ella. */
  get fuenteDePlacas(): FuenteDePlacas {
    return this.fuente;
  }

  // ── Capacidades ──────────────────────────────────────────────────────────

  /**
   * Lo que el equipo puede hacer. Del registro si la consola ya lo descubrió
   * y persistió; del aparato, una vez, si no. Un equipo desconocido devuelve
   * «sin consultar»: nadie sabe nada de él.
   */
  async capacidadesDe(dispositivoId: string): Promise<CapacidadesDeEquipo> {
    const guardadas = this.capacidades.get(dispositivoId);
    if (guardadas !== undefined) return guardadas;

    const equipo = await this.buscar(dispositivoId);
    if (equipo === null) return CAPACIDADES_SIN_CONSULTAR;

    const declaradas = equipo.capacidades;
    if (declaradas !== undefined && declaradas.origen !== 'sin_consultar') {
      this.capacidades.set(dispositivoId, declaradas);
      return declaradas;
    }
    // Inalcanzable LANZA: unas capacidades «descubiertas» sin haber hablado
    // con nadie serían una mentira. Quien pide una apertura lo traduce a «no
    // aceptado», que es lo que el puerto del dominio devuelve.
    const descubiertas = await descubrirCapacidades({
      cliente: this.cliente(equipo),
      familia: FAMILIA_DE[equipo.tipo],
      dispositivoId,
      ...(equipo.canalBarrera === null || equipo.canalBarrera === undefined
        ? {}
        : { canal: equipo.canalBarrera }),
    });
    if (descubiertas.origen !== 'sin_consultar') this.capacidades.set(dispositivoId, descubiertas);
    return descubiertas;
  }

  private async exigirCapacidad(
    dispositivoId: string,
    nombre: NombreDeCapacidad,
  ): Promise<CapacidadesDeEquipo> {
    const capacidades = await this.capacidadesDe(dispositivoId);
    const estado = estadoDe(capacidades, nombre);
    if (estado !== 'si') {
      throw new CapacidadNoSoportada(dispositivoId, nombre, estado === 'desconocida');
    }
    return capacidades;
  }

  // ── AccessPointProvider ──────────────────────────────────────────────────

  async abrir(dispositivoId: string, actorId: string): Promise<ResultadoAccionamiento> {
    const equipo = await this.resolver(dispositivoId);
    try {
      await this.exigirQueNoDecidaSolo(equipo);
      if (equipo.tipo !== 'camara_lpr' && equipo.tipo !== 'rele') {
        // Terminal y videoportero abren SÓLO si declaran apertura remota. El
        // DS-KD9633 real la declara; un modelo que no, se niega aquí con motivo.
        await this.exigirCapacidad(dispositivoId, 'aperturaRemota');
      }
    } catch (error) {
      if (error instanceof EquipoInalcanzable) {
        return { aceptado: false, latenciaMs: error.latenciaMs };
      }
      throw error;
    }
    const puerta = await this.puertaDe(equipo);

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

  /**
   * Bloqueo persistente (H-3), por dispositivo y por CAPACIDAD. La barrera lo
   * ejecuta por la misma ruta VERIFICADA con la que abre (`lock`/`unlock`); un
   * equipo que no declara `bloqueoDeAcceso` se niega con motivo, nunca con una
   * orden que parece pasar. Un equipo dado de alta antes de la 15-E tiene la
   * capacidad `desconocida` hasta que la consola lo vuelva a sondear, y eso
   * también se niega: es la dirección segura de ADR-019.
   */
  async fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento> {
    const equipo = await this.resolver(dispositivoId);
    try {
      await this.exigirCapacidad(dispositivoId, 'bloqueoDeAcceso');
      const puerta = await this.puertaDe(equipo);
      const barrera = puerta as unknown as Partial<ControlDeBarreraVehicular>;
      if (typeof barrera.fijarBloqueo !== 'function') {
        throw new CapacidadNoSoportada(dispositivoId, 'bloqueoDeAcceso', false);
      }
      return await barrera.fijarBloqueo(dispositivoId, bloqueado);
    } catch (error) {
      if (error instanceof EquipoInalcanzable) {
        return ordenInalcanzable(error.detalle, error.latenciaMs);
      }
      throw error;
    }
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
   * El puerto que la ETAPA 05 declaró y nadie implementaba. Los transportes
   * —armado, escucha y suscripción— convergen en esta misma fuente.
   */
  async suscribir(alLeer: (lectura: LecturaDePlaca) => Promise<void>): Promise<void> {
    await this.fuente.suscribir(alLeer);
  }

  // ── Escucha de lo que el equipo emite (A4) ───────────────────────────────

  /**
   * Abre el flujo del equipo y bombea lo que emite hacia la fuente compartida,
   * por el transporte que su CAPACIDAD indique (`transporteSegunCapacidades`).
   * La cámara no se escucha: publica al servidor de alarma, y abrirle además un
   * flujo sería el segundo camino silencioso que la 15-E prohíbe. Un equipo
   * que no está en el registro rechaza.
   */
  async escuchar(dispositivoId: string): Promise<EscuchaActiva> {
    const activa = this.escuchas.get(dispositivoId);
    if (activa !== undefined) return activa;

    const equipo = await this.resolver(dispositivoId);
    const familia = FAMILIA_DE[equipo.tipo];
    if (familia === 'camara') {
      return {
        dispositivoId,
        transporte: 'ninguna',
        detalle:
          'la cámara publica al servidor de alarma; escucharla además abriría un segundo camino',
        detener: () => undefined,
      };
    }

    const capacidades = await this.capacidadesDe(dispositivoId);
    const flujo = transporteSegunCapacidades(capacidades);
    const transporte = flujo === 'subscribeEvent' ? 'suscripcion' : 'escucha';
    const escucha = new EscuchaDeAlertStream({
      ...this.conexionDe(equipo),
      dispositivoId,
      familia,
      transporte: flujo,
    });
    const control = new AbortController();
    void this.bombear(escucha, control.signal, transporte);

    const nueva: EscuchaActiva = {
      dispositivoId,
      transporte,
      detalle:
        flujo === 'subscribeEvent'
          ? 'suscripción a los eventos del equipo (capacidad declarada)'
          : 'flujo de alertas del equipo (sin capacidad de suscripción declarada)',
      detener: () => {
        control.abort();
        this.escuchas.delete(dispositivoId);
      },
    };
    this.escuchas.set(dispositivoId, nueva);
    return nueva;
  }

  private async bombear(
    escucha: EscuchaDeAlertStream,
    cancelar: AbortSignal,
    transporte: 'escucha' | 'suscripcion',
  ): Promise<void> {
    try {
      for await (const evento of escucha.escuchar(cancelar)) {
        await this.fuente.publicar({ evento, foto: null, recorte: null, transporte });
      }
    } catch {
      // La escucha reintenta sola; si salió del bucle es porque se canceló.
    }
  }

  // ── FaceTemplateProvider ─────────────────────────────────────────────────

  async sincronizar(
    dispositivoId: string,
    plantillaId: string,
    plantilla: Uint8Array,
  ): Promise<void> {
    await this.exigirQueSeaTerminal(dispositivoId);
    await this.exigirCapacidad(dispositivoId, 'bibliotecaDeRostros');
    const terminal = await this.terminalDe(dispositivoId);
    await terminal.sincronizar(dispositivoId, plantillaId, plantilla);
  }

  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    await this.exigirQueSeaTerminal(dispositivoId);
    await this.exigirCapacidad(dispositivoId, 'bibliotecaDeRostros');
    const terminal = await this.terminalDe(dispositivoId);
    await terminal.suprimir(dispositivoId, plantillaId);
  }

  /**
   * A2 · el veredicto del motor, de vuelta a la terminal que espera. Exige la
   * capacidad `verificacionRemota` —una terminal que decide sola no tiene a
   * quién contestar— y delega en el adaptador de la familia, que es el único
   * que conoce la forma del cuerpo (S-39).
   */
  async responderVerificacionRemota(
    dispositivoId: string,
    veredicto: VeredictoRemoto,
  ): Promise<ResultadoAccionamiento> {
    // La capacidad ANTES que el tipo: una cámara no la declara y la negativa
    // tiene que decir «no soporta verificación remota», no «no es terminal».
    await this.exigirCapacidad(dispositivoId, 'verificacionRemota');
    await this.exigirQueSeaTerminal(dispositivoId);
    const terminal = await this.terminalDe(dispositivoId);
    return terminal.responderVerificacion(dispositivoId, veredicto);
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
   * La guarda del principio rector, para los TRES tipos. Se hace **una vez
   * por dispositivo**.
   *
   * Un equipo inalcanzable NO se da por bueno: no poder comprobarlo es no
   * saberlo, y la dirección segura de este proyecto es la misma en todas
   * partes. Lanza `EquipoInalcanzable`, que quien llama ya sabe tratar.
   */
  private async exigirQueNoDecidaSolo(equipo: EquipoRegistrado): Promise<void> {
    if (this.opciones.exigirVeredictoDeControl === false) return;
    if (this.aprobados.has(equipo.dispositivoId)) return;

    if (equipo.tipo === 'terminal_facial') {
      await this.exigirQueLaTerminalEspere(equipo);
      this.aprobados.add(equipo.dispositivoId);
      return;
    }
    if (equipo.tipo !== 'camara_lpr') return;

    const cliente = this.cliente(equipo);
    const control = rutaPara('leer quién controla la barrera: la cámara o la plataforma', 'camara');
    const respuesta = await cliente.pedir(control.metodo, control.ruta);
    const veredicto = leerVeredictoDeControl(respuesta.ok ? respuesta.cuerpo : '');

    // La TERCERA vía: un disparador vinculado con acción de E/S abre el relé
    // valga lo que valga el modo de control. Que esta consulta falle no se
    // trata como conforme — se trata como no comprobado, que bloquea igual.
    const disparador = rutaPara(
      'leer si un disparador vinculado acciona la barrera',
      'camara',
      equipo.canalBarrera ?? CARRIL_VERIFICADO_DE_LA_CAMARA,
    );
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

  /**
   * La terminal en `reporta_y_espera` tiene que TENER verificación remota. Si
   * se declaró ese modo y el equipo no la declara, es el mismo hallazgo que
   * una cámara con `ctrlMode 0`: cree decidir el sistema y decide el aparato.
   */
  private async exigirQueLaTerminalEspere(equipo: EquipoRegistrado): Promise<void> {
    if ((equipo.modoDeTerminal ?? 'decide_el_equipo') !== 'reporta_y_espera') return;
    const capacidades = await this.capacidadesDe(equipo.dispositivoId);
    const estado = estadoDe(capacidades, 'verificacionRemota');
    if (estado === 'si') return;
    throw new EquipoDecidePorSuCuenta(
      {
        admisible: false,
        modo: 'camara',
        valorLeido: estado,
        detalle:
          'la terminal se declaró en modo reporta_y_espera y ' +
          (estado === 'no'
            ? 'el equipo declara que NO espera el veredicto de la plataforma'
            : 'el equipo no declara si espera el veredicto de la plataforma'),
      },
      ['verificación remota: con eso, la terminal reconoce y abre sola'],
    );
  }

  private async puertaDe(equipo: EquipoRegistrado): Promise<AccessPointProvider> {
    const guardado = this.puertas.get(equipo.dispositivoId);
    if (guardado !== undefined) return guardado;

    const conexion = this.conexionDe(equipo);
    const creado: AccessPointProvider =
      equipo.tipo === 'camara_lpr' || equipo.tipo === 'rele'
        ? (new ControlDeBarreraVehicular(conexion) as unknown as AccessPointProvider)
        : equipo.tipo === 'terminal_facial'
          ? await this.nuevaTerminal(equipo)
          : new Videoportero({ ...conexion, numeroDePuerta: equipo.numeroDePuerta ?? null });

    this.puertas.set(equipo.dispositivoId, creado);
    return creado;
  }

  private async nuevaTerminal(equipo: EquipoRegistrado): Promise<TerminalFacial> {
    const guardada = this.terminales.get(equipo.dispositivoId);
    if (guardada !== undefined) return guardada;
    // El máximo de la biblioteca se LEE de lo que el equipo declara: es lo
    // que evita subir la plantilla que no cabe y recibir un rechazo opaco.
    const capacidades = await this.capacidadesDe(equipo.dispositivoId);
    const creada = new TerminalFacial({
      ...this.conexionDe(equipo),
      modo: equipo.modoDeTerminal ?? 'decide_el_equipo',
      numeroDePuerta: equipo.numeroDePuerta ?? null,
      bibliotecaMaximo: capacidades.bibliotecaDeRostros.maximo,
    });
    this.terminales.set(equipo.dispositivoId, creada);
    return creada;
  }

  private async exigirQueSeaTerminal(dispositivoId: string): Promise<void> {
    const equipo = await this.resolver(dispositivoId);
    if (equipo.tipo !== 'terminal_facial') {
      throw new Error(
        `El equipo ${dispositivoId} no es una terminal facial (${equipo.tipo}): sincronizar ` +
          'una plantilla contra otro aparato dejaría el dato biométrico donde nadie lo busca',
      );
    }
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
    return await this.nuevaTerminal(equipo);
  }

  private async intercomDe(dispositivoId: string): Promise<IntercomDeEquipo> {
    const guardado = this.intercomos.get(dispositivoId);
    if (guardado !== undefined) return guardado;

    const equipo = await this.resolver(dispositivoId);
    // El canal se LEE de lo que el equipo declara (D4): sin capacidad de audio
    // no hay sesión, y sin canal descubierto tampoco.
    const capacidades = await this.exigirCapacidad(dispositivoId, 'audioBidireccional');
    const creado = new IntercomDeEquipo({
      ...this.conexionDe(equipo),
      reloj: this.opciones.reloj,
      canalHabilitado: equipo.canalDeAudioHabilitado ?? false,
      canal: capacidades.audioBidireccional.canal ?? equipo.canalDeAudio ?? null,
      // A4 · contestar y colgar por señalización SÓLO si el equipo la declara
      // (el DS-KD9633 del proyecto declara que no: NO APLICA POR CAPACIDAD).
      senalizacion: soporta(capacidades, 'senalizacionDeLlamada'),
    });
    this.intercomos.set(dispositivoId, creado);
    return creado;
  }
}

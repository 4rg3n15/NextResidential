import type {
  AccessPointProvider,
  Bitacora,
  EstadoSesionIntercom,
  FaceTemplateProvider,
  IntercomProvider,
  LecturaDePlaca,
  PlateEventSource,
  Reloj,
  ResultadoAccionamiento,
  ResultadoDeAccionamiento,
  Vigencia,
} from '@ncr/domain-core';
import { ordenInalcanzable, vigenciaDeAtestacion } from '@ncr/domain-core';
import { etiqueta } from '../equipo/xml';
import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import { rutaPara, tieneRuta } from '../equipo/catalogo-de-rutas';
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import { ControlDeBarreraVehicular } from '../barrera/control-barrera';
import { TerminalFacial } from '../terminal/terminal-facial';
import type { OpcionesDeTerminal } from '../terminal/terminal-facial';
import type { AjustesDePersona } from '../terminal/persona-en-el-equipo';
import type { LimitesDeFoto } from '../terminal/foto-del-rostro';
import { Videoportero, VideoporteroSinOperador } from '../videoportero/videoportero';
import { fijarModoDePuerta } from '../equipo/modo-de-puerta';
import type { ModoDeSalida } from '../nucleo/proveedor';
import { IntercomDeEquipo } from '../videoportero/intercom-equipo';
import type { FamiliaDeAudio } from '../videoportero/intercom-equipo';
import { IntercomIsapiPersistente } from '../videoportero/intercom-isapi-persistente';
import { construirArbolDeSalidas } from '../videoportero/arbol-de-salidas';
import { leerSalidasDelEquipo } from '../videoportero/salidas-del-equipo';
import type { NodoDeSalidas } from '../nucleo/salidas';
import { EscuchaDeAlertStream, transporteSegunCapacidades } from '../equipo/escucha-alertstream';
import type { EscuchaActiva, TransporteDeEscucha } from '../nucleo/escucha';
import type { OrigenDeVideo } from '../nucleo/video';
import { PUERTO_RTSP, caminoRtspDe, eleccionDeCanalDe, origenRtspDe } from './video-rtsp';
import { fraseDeEleccion } from '../nucleo/canal-de-video';
import type { CanalDeclaradoDeVideo } from '../nucleo/canal-de-video';
import { describirRtsp } from '../equipo/rtsp-describe';
import { diagnosticoDeVideoDesde } from '../equipo/diagnostico-de-video';
import type { DiagnosticoDeVideo } from '../nucleo/video';
import { EquipoDecidePorSuCuenta } from '../camara/modo-de-control';
import { leerVeredictoDeControl } from '../camara/veredicto-de-control';
import { leerDisparador } from '../camara/disparadores-vinculados';
import { EquipoNoRegistrado } from './registro-de-equipos';
import type { EquipoRegistrado, RegistroDeEquipos } from './registro-de-equipos';
import { descubrirCapacidades } from './capacidades-hikvision';
import { CARRIL_VERIFICADO_DE_LA_CAMARA } from '../camara/carril';
import type { CapacidadesDeEquipo, NombreDeCapacidad } from '../nucleo/capacidades';
import { CAPACIDADES_SIN_CONSULTAR, estadoDe, soporta } from '../nucleo/capacidades';
import { CapacidadNoSoportada, CredencialRechazada, VideoNoReproducible } from '../nucleo/errores';
import { MEDIO_DE_ESPERA_REAL, POLITICA_DE_ORDENES, conReintentos } from '../nucleo/reintentos';
import type { MedioDeEspera } from '../nucleo/reintentos';
import { publicarConEspera } from '../nucleo/publicacion-con-espera';
import type { ProveedorDeEquipos } from '../nucleo/proveedor';
import type { VeredictoRemoto } from '../nucleo/verificacion-remota';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `HikvisionProvider` · UNA CLASE, LOS CUATRO PUERTOS · resuelve y delega
 *
 * Misma firma exacta que `MockProvider` y que el ficticio (LSP, KPI-12): la
 * suite de contrato corre contra los tres sin una rama por implementación. No
 * reimplementa protocolo: resuelve el equipo contra el registro y delega.
 *
 * Desde la 15-D decide por CAPACIDADES, no por tipo (O2, D2): cada operación
 * pregunta `capacidadesDe` y niega con `CapacidadNoSoportada` lo que el equipo
 * no declara (`desconocida` cuenta como no). La guarda del principio rector
 * alcanza a **los tres tipos** (D2):
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
  /**
   * H-SITIO-12/13/14 · la bitácora del proceso. Por aquí salen la
   * renegociación del Digest, el intercambio de cada orden de puerta y todo lo
   * que pasa en una escucha. Sin ella, el adaptador calla.
   */
  readonly traza?: Bitacora;
  /**
   * A5 (15-L) · plazo de cada petición al equipo, en ms. Sale del `.env`
   * (`EQUIPOS_TIEMPO_LIMITE_MS`): la red de sitio no es la del banco.
   */
  readonly tiempoLimiteMs?: number;
  /** A5 · la espera de los reintentos, inyectable: sin ella una prueba espera de verdad. */
  readonly medioDeReintento?: MedioDeEspera;
  /**
   * A2 (15-L) · cómo se escribe la persona en la terminal (zona, plantilla
   * horaria) y qué foto se admite. Del `.env`: varía por sitio, no por código.
   */
  readonly persona?: AjustesDePersona;
  readonly limitesDeFoto?: LimitesDeFoto;
  /** D2 (15-L) · puerto RTSP de los equipos (`VIDEO_PUERTO_RTSP`). 554 por omisión. */
  readonly puertoRtsp?: number;
  /**
   * R2 (15-N) · `EQUIPOS_DESVIO_DE_RELOJ_S`: con el reloj del equipo más
   * desviado, no se da de alta a nadie con vigencia en él.
   */
  readonly desvioDeRelojMaximoS?: number;
  /**
   * 15-P · cómo viajan los bytes del audio con el videoportero:
   * `persistente` (manual de la familia: `audioData` crudo, sin `chunked`) o
   * `fetch` (el de siempre). Lo decide `GUARDIA_AUDIO_TRANSPORTE` en la API.
   */
  readonly audioDelEquipo?: 'fetch' | 'persistente';
}

const VACIOS = { capacidades: null, ordenRemota: null, unidadesSeguras: null, submodulos: null };

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
  /** A4 (15-L) · el último veredicto de control por equipo, con su instante. */
  private readonly veredictosDeControl = new Map<
    string,
    { readonly decideSolo: boolean; readonly en: number }
  >();
  private readonly capacidades = new Map<string, CapacidadesDeEquipo>();
  private readonly puertas = new Map<string, AccessPointProvider>();
  private readonly terminales = new Map<string, TerminalFacial>();
  private readonly intercomos = new Map<string, IntercomProvider>();
  /** A4 · escuchas abiertas, una por equipo. */
  private readonly escuchas = new Map<string, EscuchaActiva>();
  /**
   * C6 (15-M) · los videoporteros con sesión de audio ABIERTA. Era un único
   * `enSesion`: el segundo videoportero pisaba al primero. Una sesión por
   * equipo (exclusividad por equipo, ADR-01); la exclusividad ENTRE operadores
   * sobre un mismo equipo la lleva cada `IntercomDeEquipo`.
   */
  private readonly sesiones = new Set<string>();

  constructor(private readonly opciones: OpcionesDeHikvision) {
    this.fuente = opciones.fuente ?? new FuenteDePlacas();
  }

  /** La fuente de placas, para que el receptor publique en ella. */
  get fuenteDePlacas(): FuenteDePlacas {
    return this.fuente;
  }

  /**
   * C1 (15-L) · lo recordado de un equipo, fuera: una edición en la consola llega
   * sin reiniciar la API. La escucha se cierra y la API (cada 30 s) la reabre.
   */
  olvidar(dispositivoId: string): void {
    this.aprobados.delete(dispositivoId);
    this.veredictosDeControl.delete(dispositivoId);
    this.capacidades.delete(dispositivoId);
    this.puertas.delete(dispositivoId);
    this.terminales.delete(dispositivoId);
    this.intercomos.delete(dispositivoId);
    this.sesiones.delete(dispositivoId);
    this.escuchas.get(dispositivoId)?.detener();
    this.escuchas.delete(dispositivoId);
    // F2 · y el registro que lo recordaba para contestar rápido a la terminal.
    this.opciones.registro.olvidar?.(dispositivoId);
    this.opciones.traza?.registrar('info', 'equipo olvidado tras un cambio en su ficha', {
      dispositivoId,
    });
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
      ...(this.opciones.traza === undefined ? {} : { traza: this.opciones.traza }),
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
      // O1 (15-N) · y un rechazo del equipo viaja con su motivo: no es «no
      // respondió» (DT-15M-06). La orden enviada no cambia.
      return {
        aceptado: resultado.estado === 'aceptada',
        latenciaMs: resultado.latenciaMs,
        ...(resultado.estado === 'rechazada' ? { rechazo: resultado.motivo } : {}),
      };
    }
    // A5 · ocupado o nonce vencido se reintentan con dispersión; nada más.
    return this.reintentando(() => puerta.abrir(dispositivoId, actorId));
  }

  // ── 15-P · P3 · salidas del videoportero ─────────────────────────────────

  /** El árbol equipo → módulo → salida que el videoportero DECLARA. */
  async salidasDe(dispositivoId: string): Promise<NodoDeSalidas> {
    const equipo = await this.resolver(dispositivoId);
    const ficha = equipo.numeroDePuerta ?? null;
    if (equipo.tipo === 'intercom') {
      return leerSalidasDelEquipo(this.conexionDe(equipo), equipo.modelo ?? 'Videoportero', ficha);
    }
    // Otros equipos no se recorren: su salida es la que declara su ficha.
    return construirArbolDeSalidas(equipo.modelo ?? 'Equipo', VACIOS, ficha);
  }

  /** Abre UNA salida del videoportero (`open`). */
  async abrirSalida(
    dispositivoId: string,
    numeroDePuerta: number,
    actorId: string,
  ): Promise<ResultadoAccionamiento> {
    const equipo = await this.resolver(dispositivoId);
    if (equipo.tipo !== 'intercom') return this.abrir(dispositivoId, actorId);
    const puerta = new Videoportero({ ...this.conexionDe(equipo), numeroDePuerta });
    return this.enLaPuerta(equipo, () => puerta.abrir(dispositivoId, actorId));
  }

  /** 15-R · P-25 · libre (`alwaysOpen`), bloqueada (`alwaysClose`) o normal (`close`). */
  async fijarModoDeSalida(
    dispositivoId: string,
    numeroDePuerta: number,
    modo: ModoDeSalida,
    actorId: string,
  ): Promise<ResultadoAccionamiento> {
    if (actorId.trim() === '') throw new VideoporteroSinOperador();
    const equipo = await this.resolver(dispositivoId);
    const familia = FAMILIA_DE[equipo.tipo];
    if (familia === 'camara')
      throw new CapacidadNoSoportada(dispositivoId, 'aperturaRemota', false);
    const conexion = this.conexionDe(equipo);
    return this.enLaPuerta(equipo, () =>
      fijarModoDePuerta(conexion, familia, numeroDePuerta, dispositivoId, modo),
    );
  }

  /** Antes de tocar una puerta: que el equipo no decida solo y que abra por orden. */
  private async enLaPuerta(
    equipo: EquipoRegistrado,
    orden: () => Promise<ResultadoAccionamiento>,
  ): Promise<ResultadoAccionamiento> {
    try {
      await this.exigirQueNoDecidaSolo(equipo);
      await this.exigirCapacidad(equipo.dispositivoId, 'aperturaRemota');
    } catch (error) {
      if (error instanceof EquipoInalcanzable)
        return { aceptado: false, latenciaMs: error.latenciaMs };
      throw error;
    }
    return this.reintentando(orden);
  }

  /**
   * A4 (15-L) · lo que el proveedor sabe de si el equipo decide solo. Lo
   * aprobado vale para todo el proceso (como en `exigirQueNoDecidaSolo`); lo
   * rechazado se recuerda un minuto —una atestación nueva tarda eso en
   * notarse— y, si no se sabe, se comprueba UNA vez. `null` si no se pudo.
   */
  async decideSolo(dispositivoId: string): Promise<boolean | null> {
    if (this.aprobados.has(dispositivoId)) return false;
    const recordado = this.veredictosDeControl.get(dispositivoId);
    if (recordado !== undefined && this.opciones.reloj.ahora().getTime() - recordado.en < 60_000) {
      return recordado.decideSolo;
    }
    try {
      await this.exigirQueNoDecidaSolo(await this.resolver(dispositivoId));
      return false;
    } catch (error) {
      return error instanceof EquipoDecidePorSuCuenta ? true : null;
    }
  }

  private reintentando<T>(orden: () => Promise<T>): Promise<T> {
    return conReintentos(orden, POLITICA_DE_ORDENES, this.opciones.medioDeReintento);
  }

  /**
   * Bloqueo persistente (H-3), por dispositivo y por CAPACIDAD, por la ruta
   * VERIFICADA con la que abre (`lock`/`unlock`). Sin `bloqueoDeAcceso` (o con
   * ella `desconocida`) se niega con motivo: la dirección segura de ADR-019.
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
    } catch (error) {
      // A5 · con la credencial ya rechazada ni se pregunta: contesta, pero no nos deja.
      return error instanceof CredencialRechazada ? 'degradado' : 'fuera_de_linea';
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

  // ── Video (A5) ───────────────────────────────────────────────────────────

  /**
   * El origen RTSP, construido aquí porque aquí viven la marca y la
   * credencial. Cámara, terminal y videoportero tienen video; relé y
   * controlador de E/S, no. El puerto RTSP y el camino del flujo son el
   * [SUPUESTO] S-46 del catálogo (documentado, se confirma en sitio).
   */
  async origenDeVideo(dispositivoId: string): Promise<OrigenDeVideo | null> {
    const equipo = await this.resolver(dispositivoId);
    // V2 (15-N) · el canal sale de lo que el equipo DECLARA: de sus capacidades
    // guardadas o, si faltan, descubiertas ahora (una vez por proceso).
    const declarados = await this.canalesDeclarados(dispositivoId, equipo);
    const eleccion = eleccionDeCanalDe(equipo, declarados);
    if (eleccion.origen === 'propuesto' && eleccion.sustituido !== null) {
      this.opciones.traza?.registrar('aviso', 'canal de video de la ficha sustituido', {
        dispositivoId,
        canal: eleccion.canal,
        motivo: fraseDeEleccion(eleccion),
      });
    }
    // D2 (15-L) · si la última respuesta RTSP del equipo, en ESTE canal, fue un
    // códec que el navegador no reproduce, se dice ahora y no con un negro.
    const video = equipo.capacidades?.video;
    const canal = eleccion.canal;
    if (
      canal !== null &&
      video !== undefined &&
      video.codec !== null &&
      video.codec !== 'H.264' &&
      video.canal === canal
    ) {
      throw new VideoNoReproducible(dispositivoId, video.codec, canal);
    }
    return origenRtspDe(equipo, this.opciones.puertoRtsp, declarados);
  }

  /** V2 (15-N) · los canales declarados; un descubrimiento fallido no tumba el video. */
  private async canalesDeclarados(
    dispositivoId: string,
    equipo: EquipoRegistrado,
  ): Promise<readonly CanalDeclaradoDeVideo[] | undefined> {
    const guardados = equipo.capacidades?.video?.canales;
    if (guardados !== undefined && guardados.length > 0) return guardados;
    try {
      return (await this.capacidadesDe(dispositivoId)).video?.canales;
    } catch {
      return undefined;
    }
  }

  /**
   * V5 (15-N) · cuando el puente no pudo tomar el flujo («wrong response on
   * DESCRIBE», «wrong user/pass»), go2rtc no dice el código: se le pregunta al
   * equipo por RTSP —la misma sonda del diagnóstico— y se cuenta en palabras.
   */
  async sondearVideo(dispositivoId: string): Promise<DiagnosticoDeVideo> {
    const equipo = await this.resolver(dispositivoId);
    const eleccion = eleccionDeCanalDe(equipo, await this.canalesDeclarados(dispositivoId, equipo));
    if (eleccion.canal === null) {
      return { canal: null, causa: 'sin_canal', codec: null, frase: fraseDeEleccion(eleccion) };
    }
    const r = await describirRtsp({
      host: equipo.host,
      puerto: this.opciones.puertoRtsp ?? PUERTO_RTSP,
      camino: caminoRtspDe(eleccion.canal),
      usuario: equipo.usuario,
      clave: equipo.clave,
      ...(this.opciones.tiempoLimiteMs === undefined
        ? {}
        : { tiempoLimiteMs: this.opciones.tiempoLimiteMs }),
    });
    return diagnosticoDeVideoDesde(eleccion.canal, r);
  }

  /** C3 (15-L) · la señal de la escucha de este equipo, si hay escucha. */
  senalDeEventos(dispositivoId: string): {
    readonly transporte: TransporteDeEscucha;
    readonly ultimaSenal: Date | null;
    readonly rechazo: string | null;
  } | null {
    const escucha = this.escuchas.get(dispositivoId);
    return escucha === undefined
      ? null
      : {
          transporte: escucha.transporte,
          ultimaSenal: escucha.ultimaSenal?.() ?? null,
          rechazo: escucha.rechazoPorOtraPlataforma?.() ?? null,
        };
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
    let terminada = false;
    void this.bombear(escucha, control.signal, transporte).then(() => {
      // A5 (15-L) · terminó sola (credencial rechazada): se retira, y el
      // próximo rearme la vuelve a pedir con la credencial que haya entonces.
      terminada = true;
      if (this.escuchas.get(dispositivoId) === nueva) this.escuchas.delete(dispositivoId);
    });

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
      activa: () => !terminada,
      ultimaSenal: () => escucha.ultimaSenal(),
      rechazoPorOtraPlataforma: () => escucha.rechazoPorOtraPlataforma(),
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
        // 15-P · 0.2 · si la plataforma tropieza, espera con dispersión y SIGUE:
        // un fallo momentáneo de la base no deja al equipo mudo para siempre.
        const desenlace = await publicarConEspera(
          () => this.fuente.publicar({ evento, foto: null, recorte: null, transporte }),
          cancelar,
          this.opciones.medioDeReintento ?? MEDIO_DE_ESPERA_REAL,
          (intento, error) => {
            this.opciones.traza?.registrar('aviso', 'escucha: la publicación falló, se reintenta', {
              dispositivoId: escucha.dispositivoId,
              intento,
              error: error instanceof Error ? error.message : String(error),
            });
          },
        );
        if (desenlace === 'perdido') {
          this.opciones.traza?.registrar(
            'error',
            'escucha: evento perdido tras reintentar; se sigue',
            {
              dispositivoId: escucha.dispositivoId,
            },
          );
        }
      }
    } catch (error) {
      // La escucha reintenta sola; si salió del bucle es porque se canceló o
      // porque la propia escucha falló. Lo segundo se DICE (H-SITIO-14).
      if (!cancelar.aborted) {
        this.opciones.traza?.registrar('error', 'escucha: el bombeo hacia la fuente se detuvo', {
          dispositivoId: escucha.dispositivoId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // ── FaceTemplateProvider ─────────────────────────────────────────────────

  /**
   * H-SITIO-09 · a CUALQUIER equipo que declare biblioteca de rostros: la
   * terminal y, si la trae, el videoportero. La guarda es la CAPACIDAD
   * (ADR-019); el tipo sólo excluye lo que no puede tenerla —cámara, relé—.
   */
  async sincronizar(
    dispositivoId: string,
    plantillaId: string,
    plantilla: Uint8Array,
    vigencia?: Vigencia,
  ): Promise<void> {
    await this.exigirQuePuedaTenerRostros(dispositivoId);
    await this.exigirCapacidad(dispositivoId, 'bibliotecaDeRostros');
    const biblioteca = await this.bibliotecaDe(dispositivoId);
    await this.reintentando(() =>
      biblioteca.sincronizar(dispositivoId, plantillaId, plantilla, vigencia),
    );
  }

  async suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    await this.exigirQuePuedaTenerRostros(dispositivoId);
    await this.exigirCapacidad(dispositivoId, 'bibliotecaDeRostros');
    const biblioteca = await this.bibliotecaDe(dispositivoId);
    await this.reintentando(() => biblioteca.suprimir(dispositivoId, plantillaId));
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
    return this.reintentando(() => terminal.responderVerificacion(dispositivoId, veredicto));
  }

  // ── IntercomProvider ─────────────────────────────────────────────────────

  async abrirSesion(dispositivoId: string, operadorId: string): Promise<EstadoSesionIntercom> {
    const intercom = await this.intercomDe(dispositivoId);
    const estado = await intercom.abrirSesion(dispositivoId, operadorId);
    if (estado === 'abierta') this.sesiones.add(dispositivoId);
    return estado;
  }

  // C6 · la forma CON dispositivo (`IntercomPorEquipo`): una sesión por equipo.

  async enviarAudioA(dispositivoId: string, fragmento: Uint8Array): Promise<void> {
    await this.sesionDe(dispositivoId).enviarAudio(fragmento);
  }

  recibirAudioDe(dispositivoId: string): AsyncIterable<Uint8Array> {
    return this.sesionDe(dispositivoId).recibirAudio();
  }

  async cerrarSesionDe(dispositivoId: string, motivo: string): Promise<void> {
    if (!this.sesiones.has(dispositivoId)) return;
    this.sesiones.delete(dispositivoId);
    await this.intercomos.get(dispositivoId)?.cerrarSesion(motivo);
  }

  async estadoSesionDe(dispositivoId: string): Promise<EstadoSesionIntercom> {
    if (!this.sesiones.has(dispositivoId)) return 'cerrada';
    return (await this.intercomos.get(dispositivoId)?.estadoSesion()) ?? 'cerrada';
  }

  // Los métodos del puerto SIN dispositivo: valen con una sola sesión abierta.

  async enviarAudio(fragmento: Uint8Array): Promise<void> {
    await this.enviarAudioA(this.unicaSesion(), fragmento);
  }

  recibirAudio(): AsyncIterable<Uint8Array> {
    return this.recibirAudioDe(this.unicaSesion());
  }

  /** Sin dispositivo se cierran TODAS: colgar de más no filtra audio a nadie. */
  async cerrarSesion(motivo: string): Promise<void> {
    for (const dispositivoId of [...this.sesiones])
      await this.cerrarSesionDe(dispositivoId, motivo);
  }

  async estadoSesion(): Promise<EstadoSesionIntercom> {
    for (const dispositivoId of this.sesiones) {
      if ((await this.estadoSesionDe(dispositivoId)) === 'abierta') return 'abierta';
    }
    return 'cerrada';
  }

  // ── Interno ──────────────────────────────────────────────────────────────

  private sesionDe(dispositivoId: string): IntercomProvider {
    const intercom = this.sesiones.has(dispositivoId)
      ? this.intercomos.get(dispositivoId)
      : undefined;
    if (intercom === undefined) {
      throw new Error(`No hay ninguna sesión de audio abierta contra el equipo ${dispositivoId}`);
    }
    return intercom;
  }

  /** La única sesión abierta, para el puerto sin dispositivo. Varias = ambiguo. */
  private unicaSesion(): string {
    const [primera, ...otras] = [...this.sesiones];
    if (primera === undefined) {
      throw new Error('No hay ninguna sesión de audio abierta contra un equipo');
    }
    if (otras.length > 0) {
      throw new Error(
        `Hay ${String(this.sesiones.size)} sesiones de audio abiertas: indique el dispositivo`,
      );
    }
    return primera;
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
    traza?: Bitacora;
    dispositivoId: string;
    tiempoLimiteMs?: number;
  } {
    return {
      host: equipo.host,
      puerto: equipo.puerto,
      protocolo: equipo.protocolo,
      usuario: equipo.usuario,
      clave: equipo.clave,
      dispositivoId: equipo.dispositivoId,
      ...(this.opciones.peticion === undefined ? {} : { peticion: this.opciones.peticion }),
      ...(this.opciones.traza === undefined ? {} : { traza: this.opciones.traza }),
      ...(this.opciones.tiempoLimiteMs === undefined
        ? {}
        : { tiempoLimiteMs: this.opciones.tiempoLimiteMs }),
    };
  }

  /**
   * La guarda del principio rector, para los TRES tipos, **una vez por
   * dispositivo**. Inalcanzable NO se da por bueno: lanza `EquipoInalcanzable`.
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
      const motivos = [
        ...veredicto.bloqueos.map((b) => `${b.campo}: ${b.detalle}`),
        ...(abrePorDisparador ? [detalleDelDisparador] : []),
      ];
      if (await this.atestadaParaEsteFirmware(equipo, cliente, motivos)) {
        this.aprobados.add(equipo.dispositivoId);
        return;
      }
      this.veredictosDeControl.set(equipo.dispositivoId, {
        decideSolo: true,
        en: this.opciones.reloj.ahora().getTime(),
      });
      throw new EquipoDecidePorSuCuenta(veredicto.modo, motivos);
    }
    this.aprobados.add(equipo.dispositivoId);
  }

  /**
   * D-11 · un instalador VERIFICÓ físicamente que la cámara no decide, con este
   * firmware: se opera y queda en la bitácora (una firma, no un verde). El
   * firmware se lee EN VIVO; si no se puede leer, no vale. Añade a `motivos`.
   */
  private async atestadaParaEsteFirmware(
    equipo: EquipoRegistrado,
    cliente: ClienteDeEquipo,
    motivos: string[],
  ): Promise<boolean> {
    const atestacion = equipo.atestacion ?? null;
    if (atestacion === null) return false;
    const identidad = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'comun');
    let firmware: string | null = null;
    try {
      const r = await cliente.pedir(identidad.metodo, identidad.ruta);
      firmware = r.ok ? etiqueta(r.cuerpo, 'firmwareVersion') : null;
    } catch (error) {
      if (!(error instanceof EquipoInalcanzable)) throw error;
    }
    const vigencia = vigenciaDeAtestacion(atestacion, firmware);
    if (!vigencia.vigente) {
      motivos.push(`atestación del instalador sin efecto: ${vigencia.motivo}`);
      return false;
    }
    this.opciones.traza?.registrar(
      'aviso',
      'cámara operada por ATESTACIÓN del instalador: la API no confirma que no decida sola',
      { dispositivoId: equipo.dispositivoId, firmware: vigencia.firmware, bloqueos: motivos },
    );
    return true;
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
      ...this.ajustesDeBiblioteca(),
      ...declaradoParaElAlta(capacidades),
    });
    this.terminales.set(equipo.dispositivoId, creada);
    return creada;
  }

  /** A2 (15-L) · lo que el `.env` fija para toda biblioteca de rostros. */
  private ajustesDeBiblioteca(): Pick<
    OpcionesDeTerminal,
    'persona' | 'limitesDeFoto' | 'desvioDeRelojMaximoS' | 'horaDelServidor'
  > {
    return {
      ...(this.opciones.persona === undefined ? {} : { persona: this.opciones.persona }),
      ...(this.opciones.limitesDeFoto === undefined
        ? {}
        : { limitesDeFoto: this.opciones.limitesDeFoto }),
      // R2 (15-N) · el reloj del equipo se juzga contra el de la plataforma.
      ...(this.opciones.desvioDeRelojMaximoS === undefined
        ? {}
        : { desvioDeRelojMaximoS: this.opciones.desvioDeRelojMaximoS }),
      horaDelServidor: () => this.opciones.reloj.ahora(),
    };
  }

  private async exigirQuePuedaTenerRostros(dispositivoId: string): Promise<void> {
    const equipo = await this.resolver(dispositivoId);
    if (equipo.tipo !== 'terminal_facial' && equipo.tipo !== 'intercom') {
      throw new Error(
        `El equipo ${dispositivoId} no tiene biblioteca de rostros (${equipo.tipo}): ` +
          'sincronizar una plantilla contra otro aparato dejaría el dato biométrico donde nadie lo busca',
      );
    }
  }

  /**
   * La biblioteca de rostros del equipo: la terminal, o el videoportero que la
   * declara. Las rutas son las mismas de la guía de control de acceso; el
   * videoportero no decide el acceso por rostro en este sistema, así que su
   * modo es el conservador y su puerta sigue abriéndose por orden.
   */
  private async bibliotecaDe(dispositivoId: string): Promise<TerminalFacial> {
    const equipo = await this.resolver(dispositivoId);
    if (equipo.tipo === 'terminal_facial') return this.terminalDe(dispositivoId);
    const guardada = this.terminales.get(dispositivoId);
    if (guardada !== undefined) return guardada;
    const capacidades = await this.capacidadesDe(dispositivoId);
    const creada = new TerminalFacial({
      ...this.conexionDe(equipo),
      modo: 'decide_el_equipo',
      numeroDePuerta: equipo.numeroDePuerta ?? null,
      bibliotecaMaximo: capacidades.bibliotecaDeRostros.maximo,
      ...this.ajustesDeBiblioteca(),
      // E3 (15-M) · el videoportero da de alta como DECLARA, no como la terminal.
      ...declaradoParaElAlta(capacidades),
    });
    this.terminales.set(dispositivoId, creada);
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

  private async intercomDe(dispositivoId: string): Promise<IntercomProvider> {
    const guardado = this.intercomos.get(dispositivoId);
    if (guardado !== undefined) return guardado;

    const equipo = await this.resolver(dispositivoId);
    // El canal se LEE de lo que el equipo declara (D4): sin capacidad de audio
    // no hay sesión, y sin canal descubierto tampoco.
    const capacidades = await this.exigirCapacidad(dispositivoId, 'audioBidireccional');
    const Adaptador =
      this.opciones.audioDelEquipo === 'persistente' ? IntercomIsapiPersistente : IntercomDeEquipo;
    // B (15-S1) · las rutas son de la familia DEL EQUIPO: la terminal habla por
    // las suyas, no por las del videoportero.
    const familia: FamiliaDeAudio = equipo.tipo === 'terminal_facial' ? 'terminal' : 'videoportero';
    const creado = new Adaptador({
      ...this.conexionDe(equipo),
      reloj: this.opciones.reloj,
      familia,
      // H-15S1-C07 · la casilla de la ficha: una persona atesta que el equipo abre.
      canalHabilitado: equipo.canalDeAudioHabilitado ?? false,
      canal: capacidades.audioBidireccional.canal ?? equipo.canalDeAudio ?? null,
      // A4 · contestar y colgar por señalización SÓLO si el equipo la declara
      // (el DS-KD9633 del proyecto declara que no: NO APLICA POR CAPACIDAD). B
      // (15-S1) · y si su familia la tiene catalogada: la terminal, no.
      senalizacion:
        soporta(capacidades, 'senalizacionDeLlamada') &&
        tieneRuta('contestar o rechazar una llamada del videoportero', familia),
    });
    this.intercomos.set(dispositivoId, creado);
    return creado;
  }
}

/**
 * E3 (15-M) · lo que el equipo declaró sobre personas y biblioteca, para que
 * el alta de un rostro sea la que ÉL admite (`terminal/forma-del-alta.ts`).
 */
const declaradoParaElAlta = (
  c: CapacidadesDeEquipo,
): Pick<OpcionesDeTerminal, 'tiposDePersona' | 'operacionesDeBiblioteca'> => ({
  ...(c.tiposDePersona === undefined ? {} : { tiposDePersona: c.tiposDePersona }),
  ...(c.bibliotecaDeRostros.operaciones === undefined
    ? {}
    : { operacionesDeBiblioteca: c.bibliotecaDeRostros.operaciones }),
});

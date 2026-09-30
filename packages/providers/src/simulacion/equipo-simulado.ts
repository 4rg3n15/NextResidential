import { RUTAS } from '../equipo/catalogo-de-rutas';
import type { RutaDeEquipo } from '../equipo/catalogo-de-rutas';
import {
  CONTENIDO_XML_MALO,
  DigestDelEquipo,
  anotarEn,
  aperturasFisicasPor,
  cuerpoVacio,
  desenlaceDeApertura,
  escriturasSinCuerpoPor,
  exigeCuerpo,
} from './comportamientos-de-sitio';
import type { DesafiosDelEquipo, PoliticaDeNonceDelEquipo } from './comportamientos-de-sitio';
import { VerificacionRemotaSimulada } from './verificacion-remota-simulada';
import type { AlEmitir, FlujoEnVivo } from './verificacion-remota-simulada';
import {
  decisionLocal,
  horaDePared,
  leerPersona,
  negacionesLocalesPor,
  negadoEnLocal,
  personasPor,
} from './personas-simuladas';
import type { PersonaSimulada } from './personas-simuladas';
import {
  CANALES_POR_OMISION,
  CAPACIDADES_DE_CANAL,
  ESPACIO,
  canalesDeAudio,
  capacidadesDelSistema,
  datosBasicos,
  disparador,
  documentoDelReceptor,
  entranceParam,
  ordenesDePuerta,
  receptorEscrito,
  receptorInicial,
} from './documentos-del-simulado';
import type { CanalDeAudioSimulado } from './documentos-del-simulado';
import { caminoCasa, respuestaDe } from './respuesta-simulada';
import { conSituacionesDeSitio } from './situaciones-de-sitio';
import type { SituacionesDeSitio } from './situaciones-de-sitio';

export { aperturasFisicasPor, escriturasSinCuerpoPor } from './comportamientos-de-sitio';
export {
  FlujoEnVivo,
  desenlacesDeVerificacionPor,
  PLAZO_DE_VERIFICACION_MS,
} from './verificacion-remota-simulada';
export type { DesenlaceDeVerificacion, VerificacionResuelta } from './verificacion-remota-simulada';
export type { SituacionesDeSitio } from './situaciones-de-sitio';

/**
 * UN EQUIPO QUE HABLA COMO LOS DE VERDAD, Y QUE NO EXISTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ES ADR-03, LITERALMENTE
 *
 * «Todo el sistema debe funcionar completo contra el simulado. Si el sistema
 * necesita hardware para demostrarse, el desacople falló.» Esto es la otra
 * mitad de esa frase: sin un equipo que conteste, los adaptadores de esta etapa
 * sólo se podrían probar con dobles escritos a la medida de cada prueba, y un
 * doble a medida confirma lo que el autor ya creía.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ SIMULA DE VERDAD, Y NO DE ADORNO
 *
 * · **Digest de dos viajes.** El primer intento sin credenciales recibe `401`
 *   con desafío, como el aparato. Un simulado que aceptara a la primera dejaría
 *   sin ejercitar la renegociación, que es donde vive el fallo que bloquea la
 *   cuenta del equipo. Y desde el anexo 15-K el nonce VENCE, el cuerpo vacío se
 *   rechaza antes de autenticar y la apertura sin espacio de nombres contesta
 *   «OK» sin accionar: `comportamientos-de-sitio.ts`.
 * · **`notSupport` por ruta.** Se le puede decir qué rutas NO soporta, que es
 *   el desenlace esperado de las once DOCUMENTADAS, NO VERIFICADAS. Probar sólo
 *   el camino feliz de una ruta sin verificar es probar la suposición.
 * · **El volcado histórico del flujo de eventos.** Con `currentEvent: false`,
 *   antes de lo vivo, porque ésa es la trampa real de la puesta en marcha.
 *
 * Lo que **no** simula: latencia ni fallos aleatorios. Eso ya lo hace
 * `mock/simulacion.ts` con semilla, y duplicarlo aquí daría dos generadores de
 * adversidad que se comportan distinto.
 */

export interface GuionDeEquipo {
  /** Familia, para responder sólo a las rutas que le corresponden. */
  readonly familia: RutaDeEquipo['familia'];
  readonly usuario: string;
  readonly clave: string;
  /** Propósitos que este firmware NO soporta. Contesta `notSupport`. */
  readonly sinSoporte?: readonly string[];
  /** Bloques que el flujo de eventos entrega al conectar, en orden. */
  readonly flujo?: readonly Record<string, unknown>[];
  /**
   * 15-L · un flujo que se queda ABIERTO y emite cuando la prueba lo pide,
   * como el del equipo. Si está, manda sobre `flujo`.
   */
  readonly enVivo?: FlujoEnVivo;
  /**
   * 15-L · el canal de verificación con el que está configurada la terminal.
   * Sólo con `ISAPI` (modo armado) pregunta por el flujo: con `ISAPIListen`
   * pregunta a un servidor de escucha que la plataforma no abre.
   */
  readonly canalDeVerificacion?: 'ISAPI' | 'ISAPIListen';
  /** 15-L · plazo de la verificación, en ms, para probar el vencimiento. */
  readonly plazoDeVerificacionMs?: number;
  /** Identidad que devuelve la ruta de `deviceInfo`. */
  readonly modelo?: string;
  readonly firmware?: string;
  /**
   * Quién controla la barrera, según el equipo: `0` cámara · `1` plataforma ·
   * `2` ambos. Por omisión `1`, que es el único admisible — pero se puede
   * declarar `0` o `2` **a propósito**, que es lo que permite probar que el
   * sistema se niega a operar contra un equipo que decide por su cuenta.
   */
  readonly ctrlMod?: '0' | '1' | '2';
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * LO QUE LA 15-C AÑADE, Y POR QUÉ SON MANDOS Y NO CONSTANTES
   *
   * El veredicto de «quién decide» ya no sale de un campo: sale de tres vías, y
   * un simulado que sólo supiera contestar la primera dejaría las otras dos sin
   * ejercitar. Cada mando de abajo existe para poder producir **el escenario
   * malo**, que es lo único que demuestra que la guarda funciona.
   *
   * Los valores por omisión son los de un equipo CONFORME: así, una prueba que
   * no diga nada obtiene un equipo correcto, y el que quiera uno defectuoso
   * tiene que pedirlo — no al revés.
   */
  /** Operación de barrera de la política de lista blanca del equipo. */
  readonly operacionDeListaBlanca?: string;
  /** Deja la barrera arriba con vehículos pegados: pasa gente sin evento. */
  readonly noCierraConVehiculosPegados?: boolean;
  /** Puerto de salida al que un disparador vinculado acciona, si lo hay. */
  readonly disparadorAccionaPuerto?: string;
  /** Índice de reconocimiento de placa. 210 es Colombia. */
  readonly indiceDePais?: string;
  /** Formato en el que el equipo publica: `XML` o `JSON`. */
  readonly formatoDeNotificacion?: string;
  /** Qué imágenes envía. `all` incluye los recortes de ROSTRO. */
  readonly imagenesDelEvento?: string;
  readonly reportaEstadoDeBarrera?: boolean;
  readonly estadoDeBarrera?: '0' | '1' | '2';
  /** Hora que declara el equipo, para ejercitar el desvío de reloj. */
  readonly hora?: string;
  /** `false` deja al equipo sin declarar reconocimiento de matrícula. */
  readonly declaraReconocimiento?: boolean;

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * LO QUE LA 15-D AÑADE · CAPACIDADES Y DESENLACES DE ERROR
   *
   * El proveedor ya no decide por tipo declarado sino por lo que el equipo
   * DECLARA, y un simulado que no pudiera declarar «no» a una capacidad
   * dejaría sin ejercitar la mitad nueva: la que niega con motivo tipado. Cada
   * mando de abajo produce un equipo CAPAZ por omisión y un equipo INCAPAZ o
   * AVERIADO a petición — nunca al revés.
   */
  /** `false` → `isSupportRemoteOpenDoor=false`: la plataforma no puede abrir. */
  readonly aperturaRemota?: boolean;
  /** Por omisión `false`, que es lo que declara el DS-KD9633 real. */
  readonly senalizaLlamadas?: boolean;
  /** `false` → `isSupportSubscribeEvent=false`. */
  readonly admiteSuscripcion?: boolean;
  /** Canales de audio bidireccional que declara. Vacío = sin audio. */
  readonly canalesDeAudio?: readonly {
    readonly id: number;
    readonly habilitado: boolean;
    readonly codec?: string;
  }[];
  /** `false` → `AcsCfg.remoteCheckDoorEnabled=false`: la terminal decide sola. */
  readonly verificacionRemota?: boolean;
  /** Rótulo para consultar después qué veredictos recibió (A2). Opcional. */
  readonly destino?: string;
  /**
   * H-SITIO-09 · un VIDEOPORTERO con biblioteca de rostros: contesta también
   * las rutas de biblioteca y de personas de la guía de control de acceso.
   * Sin esto, el videoportero simulado dice «no admito» —NO APLICA—.
   */
  readonly bibliotecaEnVideoportero?: boolean;
  /** Capacidad y ocupación de la biblioteca de rostros. */
  readonly bibliotecaMaximo?: number;
  readonly bibliotecaAlmacenadas?: number;
  /** Órdenes que la puerta admite desde la plataforma. */
  readonly ordenesDePuerta?: readonly string[];
  /** El equipo no contesta a la consulta de capacidades: todo queda DESCONOCIDO. */
  readonly sinCapacidades?: boolean;
  /**
   * V2 (15-N) · los flujos que lista en `/Streaming/channels`, con su códec.
   * Sin él, no los lista (como un equipo que no admite la consulta).
   */
  readonly canalesDeVideo?: readonly { readonly id: string; readonly codec: string }[];
  /** Desenlaces de error, cada uno con su código del fabricante. */
  readonly ocupado?: boolean;
  readonly averiado?: boolean;
  readonly reinicioNecesario?: boolean;
  /** Rechaza la credencial aunque el Digest sea correcto: cuenta bloqueada. */
  readonly rechazaCredencial?: boolean;
  /** E1-f (15-M) · con la clave mala, declara la cuenta bloqueada por estos segundos. */
  readonly cuentaBloqueadaSegundos?: number;
  /** Anexo 15-K · cuándo vence el nonce. Por omisión, a los 20 s. */
  readonly nonce?: PoliticaDeNonceDelEquipo;
  /** A2 (15-L) · la puerta que gobierna esta terminal, para su `doorRight`. */
  readonly puerta?: number;
  /** A2 (15-L) · la zona del reloj del equipo. America/Bogota por omisión. */
  readonly zonaHoraria?: string;
  /**
   * J (15-L) · tercera respuesta engañosa de sitio: la apertura contesta 2xx
   * SIN `statusCode 1` y el relé no se mueve. No es un éxito.
   */
  readonly aperturaSinConfirmar?: boolean;
  /** J (15-L) · lo que declara la gestión de personas (`supportFunction`). */
  readonly funcionesDePersonas?: string;
  /**
   * E3 (15-M) · los `userType` que admite (`normal,visitor,blackList` por
   * omisión). El DS-KD9633 del 29/09 sólo `normal`: un alta con otro tipo se
   * rechaza con `badParameters`, como el equipo.
   */
  readonly tiposDePersona?: string;
  /**
   * E3 (15-M) · las operaciones que declara su biblioteca (`supportFunction`
   * de FDLib). Sin ella no las declara y admite las dos cargas. El DS-KD9633:
   * `post,delete,put,get` — sin `setUp`, así que `FDSetUp` le es `notSupport`.
   */
  readonly operacionesDeBiblioteca?: string;
  /** J2 (15-L) · la serie que declara: un respaldo de otro equipo no se aplica. */
  readonly serie?: string;
  /** C2 (15-L) · a dónde publica la cámara. Lo escrito después se lee (tiene estado). */
  readonly receptor?: {
    readonly ip?: string;
    readonly nombre?: string;
    readonly puerto?: number;
    readonly url?: string;
  };
  /** C7 y F4 (15-L) · lo que HikCentral y el firmware «Ultra» hicieron en sitio. */
  readonly situaciones?: SituacionesDeSitio;
}

/** Respuestas de error con el código de estado general del fabricante. */
const ERROR_OCUPADO =
  '<ResponseStatus><statusCode>2</statusCode><statusString>Device Busy</statusString>' +
  '<subStatusCode>deviceBusy</subStatusCode></ResponseStatus>';
const ERROR_AVERIADO =
  '<ResponseStatus><statusCode>3</statusCode><statusString>Device Error</statusString></ResponseStatus>';
const ERROR_REINICIO =
  '<ResponseStatus><statusCode>7</statusCode><statusString>Reboot Required</statusString></ResponseStatus>';
const LLENA = '{"statusCode":6,"statusString":"Invalid Content","subStatusCode":"faceLibraryFull"}';
/** H-SITIO-04 · lo que contesta el equipo a un formulario que no es el de la guía. */
const PARAMETRO_MALO =
  '{"statusCode":6,"statusString":"Invalid Content","subStatusCode":"badParameters",' +
  '"errorCode":1610612737,"errorMsg":"badParameters"}';

/** Como la guía: `subStatusCode` es obligatorio también en el «OK». */
/** A2 (15-L) · `[SUPUESTO]` S-70: el texto exacto de estos dos no está en el extracto. */
const PERSONA_YA_EXISTE =
  '{"statusCode":6,"statusString":"Invalid Content","subStatusCode":"employeeNoAlreadyExist",' +
  '"errorCode":1610637344,"errorMsg":"employeeNoAlreadyExist"}';
const PERSONA_NO_EXISTE =
  '{"statusCode":6,"statusString":"Invalid Content","subStatusCode":"employeeNoNotExist",' +
  '"errorCode":1610637345,"errorMsg":"employeeNoNotExist"}';

const OK =
  '<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString>' +
  '<subStatusCode>ok</subStatusCode></ResponseStatus>';
const NO_SOPORTA =
  '<ResponseStatus><statusCode>4</statusCode><statusString>notSupport</statusString></ResponseStatus>';

/** E3 (15-M) · ¿la lista `@opt` declarada trae ese valor? Sin distinguir mayúsculas. */
const declara = (lista: string, valor: string): boolean =>
  lista
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .includes(valor.toLowerCase());

/** El reino del desafío Digest del simulado. */
const REINO = 'equipo-simulado';

/** Flujo de eventos: los bloques, uno detrás de otro, y después se cierra. */
const cuerpoDeFlujo = (
  bloques: readonly Record<string, unknown>[],
  alEmitir: AlEmitir,
): ReadableStream<Uint8Array> => {
  const codificador = new TextEncoder();
  let i = 0;
  return {
    getReader: () => ({
      read: async () => {
        const bloque = bloques[i++];
        if (bloque === undefined) return { done: true, value: undefined };
        // A2 · el equipo puede negar en local: entonces emite OTRO bloque.
        const emitido = alEmitir(bloque) ?? bloque;
        return { done: false, value: codificador.encode(JSON.stringify(emitido)) };
      },
      cancel: async () => undefined,
    }),
  } as unknown as ReadableStream<Uint8Array>;
};

/** Flujo de bytes tal cual: lo que se usa para devolver audio. */
const cuerpoBinario = (trozos: readonly Uint8Array[]): ReadableStream<Uint8Array> => {
  let i = 0;
  return {
    getReader: () => ({
      read: async () =>
        i < trozos.length ? { done: false, value: trozos[i++] } : { done: true, value: undefined },
      cancel: async () => undefined,
    }),
  } as unknown as ReadableStream<Uint8Array>;
};

/** Lo que cada terminal simulada recibió como veredicto, por destino (A2). */
export const veredictosRecibidosPor = new Map<string, string[]>();
/**
 * F (15-L) · la biblioteca de rostros de cada terminal simulada, por destino:
 * el recorrido de la consola pregunta al EQUIPO si el rechazo de una visita
 * le quitó la plantilla, no a la pantalla que dice que sí.
 */
export const plantillasPor = new Map<string, ReadonlySet<string>>();
/** E1 (15-M) · los 401 que dio cada equipo simulado y por qué, por destino. */
export const desafiosPor = new Map<string, () => DesafiosDelEquipo>();

/** V2 (15-N) · el `StreamingChannelList` del equipo, habilitados, con su códec. */
const listaDeFlujos = (
  canales: readonly { readonly id: string; readonly codec: string }[],
): string =>
  '<StreamingChannelList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">' +
  canales
    .map(
      (c) =>
        `<StreamingChannel><id>${c.id}</id><enabled>true</enabled>` +
        `<Video><videoCodecType>${c.codec}</videoCodecType></Video></StreamingChannel>`,
    )
    .join('') +
  '</StreamingChannelList>';

export const equipoSimulado = (guion: GuionDeEquipo): typeof fetch => {
  /**
   * Estado mutable del equipo: la corrección lo cambia y la lectura lo ve. Es
   * el `AcsCfg` entero de la guía, no un booleano: la corrección de la 15-L
   * escribe también el canal y la apertura sin plataforma, y un simulado que
   * sólo guardara el interruptor diría «aplicada» sin que lo estuviera.
   */
  const acs: Record<string, unknown> = {
    remoteCheckDoorEnabled: guion.verificacionRemota !== false,
    checkChannelType: guion.canalDeVerificacion ?? 'ISAPI',
    needDeviceCheck: true,
    remoteCheckTimeout: 5,
    offlineDevCheckOpenDoorEnabled: false,
  };
  const verificacion = new VerificacionRemotaSimulada(guion.destino, guion.plazoDeVerificacionMs);
  /** A2 (15-L) · las personas dadas de alta, con su vigencia y sus puertas. */
  const personas = new Map<string, PersonaSimulada>();
  if (guion.destino !== undefined) personasPor.set(guion.destino, personas);
  /**
   * Antes de preguntar, la terminal decide en local (S-70): fuera de vigencia o
   * sin permiso de puerta, niega y emite otro bloque. Después, sólo en modo
   * armado y con el interruptor puesto, pregunta por el flujo.
   */
  const preguntaPorElFlujo: AlEmitir = (bloque) => {
    const acceso = bloque['AccessControllerEvent'] as Record<string, unknown> | undefined;
    const quien = acceso?.['employeeNoString'] ?? acceso?.['employeeNo'];
    if (acceso !== undefined && (typeof quien === 'string' || typeof quien === 'number')) {
      const decision = decisionLocal(
        personas.get(String(quien)),
        horaDePared(bloque['dateTime'] ?? acceso['time'], guion.zonaHoraria ?? 'America/Bogota'),
        guion.puerta ?? 1,
      );
      if (decision !== 'pregunta') {
        if (guion.destino !== undefined) {
          const lista = negacionesLocalesPor.get(guion.destino) ?? [];
          lista.push(`${String(quien)}:${decision}`);
          negacionesLocalesPor.set(guion.destino, lista);
        }
        return negadoEnLocal(bloque);
      }
    }
    if (acs['remoteCheckDoorEnabled'] === true && acs['checkChannelType'] === 'ISAPI') {
      verificacion.alEmitir(bloque);
    }
    return undefined;
  };
  const flujoDeEventos = (): ReadableStream<Uint8Array> =>
    guion.enVivo === undefined
      ? cuerpoDeFlujo(guion.flujo ?? [], preguntaPorElFlujo)
      : guion.enVivo.cuerpo(preguntaPorElFlujo);
  /** 15-K (§4) · el modo de control también: la corrección lo escribe y se lee. */
  let modoDeControl = guion.ctrlMod ?? '1';
  const veredictosRecibidos: string[] = [];
  if (guion.destino !== undefined) veredictosRecibidosPor.set(guion.destino, veredictosRecibidos);
  const sinSoporte = new Set(guion.sinSoporte ?? []);
  /** Estado de la biblioteca de rostros: lo que se carga se cuenta y se busca. */
  const plantillas = new Set<string>();
  if (guion.destino !== undefined) plantillasPor.set(guion.destino, plantillas);
  const almacenadasSinNombre = guion.bibliotecaAlmacenadas ?? 0;
  const enBiblioteca = (): number => almacenadasSinNombre + plantillas.size;
  /** Audio recibido, para devolverlo como eco por el flujo de salida. */
  const audioRecibido: Uint8Array[] = [];
  /** J2 (15-L) · los canales de audio, que la reversión escribe y se leen. */
  const canales: CanalDeAudioSimulado[] = [...(guion.canalesDeAudio ?? CANALES_POR_OMISION)];
  /** Anexo 15-K · el Digest del equipo, con el nonce que vence. */
  const digest = new DigestDelEquipo(guion.usuario, guion.clave, REINO, guion.nonce);
  if (guion.destino !== undefined) desafiosPor.set(guion.destino, () => digest.estadisticas());
  /** C2 (15-L) · a dónde publica la cámara: lo escrito se vuelve a leer. */
  let receptor = receptorInicial(guion);

  const equipo = (async (entrada: string | URL, opciones?: RequestInit): Promise<Response> => {
    const url = new URL(typeof entrada === 'string' ? entrada : String(entrada));
    const metodo = opciones?.method ?? 'GET';
    const cabeceras = (opciones?.headers ?? {}) as Record<string, string>;

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * SE BUSCA POR RUTA **Y MÉTODO**, y no sólo por ruta
     *
     * Varias entradas del catálogo comparten camino y se distinguen por el
     * verbo: leer la configuración del receptor es un `GET` sobre la misma
     * ruta en la que se escribe con `PUT`. Buscando sólo por ruta ganaba la
     * primera del catálogo, así que una lectura se contestaba con la respuesta
     * de una escritura — y el simulado dejaba de simular nada.
     *
     * Lo destapó la prueba del formato de notificación, que pedía un documento
     * y recibía un `OK` genérico.
     */
    const delMismoCamino = RUTAS.filter(
      (r) =>
        caminoCasa(r.ruta, url.pathname) &&
        (r.familia === guion.familia ||
          r.familia === 'comun' ||
          (guion.familia === 'videoportero' &&
            guion.bibliotecaEnVideoportero === true &&
            r.familia === 'terminal' &&
            /biblioteca|plantilla|persona|control de acceso de la terminal/.test(r.proposito))),
    );
    const catalogada = delMismoCamino.find((r) => r.metodo === metodo) ?? delMismoCamino[0];

    /**
     * Anexo 15-K · H-SITIO-15 · el equipo valida el CONTENIDO antes que la
     * credencial: una escritura con el cuerpo vacío recibe `400 badXmlContent`
     * sin pasar por el desafío. Un cliente que sondea el Digest con el cuerpo
     * vacío no llega nunca a autenticarse.
     */
    if (
      catalogada !== undefined &&
      exigeCuerpo(catalogada, metodo) &&
      cuerpoVacio(opciones?.body)
    ) {
      anotarEn(escriturasSinCuerpoPor, guion.destino);
      return respuestaDe(400, CONTENIDO_XML_MALO);
    }

    // Primer viaje: sin credenciales, el equipo contesta con su desafío. Con la
    // cuenta bloqueada, 401 aunque el Digest sea correcto. Anexo 15-K ·
    // H-SITIO-12: con el nonce vencido o un `nc` repetido, `stale="TRUE"`.
    const acceso =
      guion.rechazaCredencial === true
        ? 'clave'
        : digest.comprobar(cabeceras['authorization'] ?? null, metodo);
    if (acceso !== 'autenticado') {
      // E1 (15-M) · según `alVencer`: con desafío `stale`, sin desafío, o
      // `stale="FALSE"`; y el `userCheck` con el bloqueo si el guion lo dice.
      const rechazo = digest.rechazo(acceso, guion.cuentaBloqueadaSegundos ?? null);
      return respuestaDe(401, rechazo.cuerpo, rechazo.cabeceras);
    }

    // Una ruta que el adaptador pide y el catálogo no conoce es un error de
    // programación: el equipo contesta 404, igual que el de verdad.
    if (catalogada === undefined) return respuestaDe(404, 'not found');
    if (sinSoporte.has(catalogada.proposito)) return respuestaDe(200, NO_SOPORTA);
    if (
      guion.sinCapacidades === true &&
      /capacidades|qué admite|canales de audio|espera el veredicto|contar las plantillas|qué órdenes admite/.test(
        catalogada.proposito,
      )
    ) {
      return respuestaDe(200, NO_SOPORTA);
    }

    /**
     * Los desenlaces de error, ANTES de contestar nada: un equipo ocupado o
     * averiado lo está para todas las escrituras, y el adaptador tiene que
     * traducirlo a la clase neutral correcta, no a «no se pudo».
     */
    const escribe = metodo !== 'GET';
    if (escribe && guion.ocupado === true) return respuestaDe(503, ERROR_OCUPADO);
    if (escribe && guion.averiado === true) return respuestaDe(500, ERROR_AVERIADO);
    if (escribe && guion.reinicioNecesario === true) return respuestaDe(200, ERROR_REINICIO);

    if (catalogada.proposito === 'leer los canales de video del equipo') {
      return guion.canalesDeVideo === undefined
        ? respuestaDe(200, NO_SOPORTA)
        : respuestaDe(200, listaDeFlujos(guion.canalesDeVideo));
    }
    if (catalogada.proposito === 'leer los canales de audio bidireccional del equipo') {
      return respuestaDe(200, canalesDeAudio(canales));
    }
    if (catalogada.proposito === 'configurar un canal de audio bidireccional') {
      // Engañosa 1 también aquí: sin espacio de nombres, «OK» y nada cambia.
      const cuerpo = String(opciones?.body ?? '');
      const id = Number(/channels\/(\d+)$/.exec(url.pathname)?.[1]);
      const i = canales.findIndex((c) => c.id === id);
      const activo = /<enabled>\s*(true|false)\s*</.exec(cuerpo)?.[1];
      if (i < 0 || activo === undefined) return respuestaDe(400, PARAMETRO_MALO);
      const actual = canales[i];
      if (actual !== undefined && cuerpo.includes(`xmlns="${ESPACIO}"`)) {
        canales[i] = { ...actual, habilitado: activo === 'true' };
      }
      return respuestaDe(200, OK);
    }
    if (catalogada.proposito === 'leer qué admite la gestión de personas') {
      return respuestaDe(
        200,
        JSON.stringify({
          UserInfo: {
            supportFunction: { '@opt': guion.funcionesDePersonas ?? 'post,delete,put,get,setUp' },
            maxRecordNum: 3000,
            userType: { '@opt': guion.tiposDePersona ?? 'normal,visitor,blackList' },
          },
        }),
      );
    }
    if (catalogada.proposito === 'leer qué órdenes admite la puerta desde la plataforma') {
      return respuestaDe(200, ordenesDePuerta(guion));
    }
    if (catalogada.proposito === 'leer si la terminal espera el veredicto de la plataforma') {
      // H-SITIO-05 · el interruptor con el nombre de la guía.
      return respuestaDe(200, JSON.stringify({ AcsCfg: acs }));
    }
    if (catalogada.proposito === 'fijar que la terminal espere el veredicto de la plataforma') {
      // Leer-modificar-escribir de verdad: lo que se escribe es lo que la
      // siguiente lectura devuelve. Sin esto, la corrección parecería aplicada
      // y la ficha seguiría en bloqueo.
      let escrito: unknown;
      try {
        escrito = (JSON.parse(String(opciones?.body ?? '')) as { AcsCfg?: unknown }).AcsCfg;
      } catch {
        return respuestaDe(400, ERROR_AVERIADO);
      }
      if (
        typeof escrito !== 'object' ||
        escrito === null ||
        typeof (escrito as Record<string, unknown>)['remoteCheckDoorEnabled'] !== 'boolean'
      ) {
        return respuestaDe(400, ERROR_AVERIADO);
      }
      // Sólo los campos que el equipo tiene: uno desconocido no se inventa.
      for (const [campo, valor] of Object.entries(escrito)) {
        if (campo in acs) acs[campo] = valor;
      }
      return respuestaDe(200, OK);
    }
    if (catalogada.proposito === 'responder la verificación remota de la terminal') {
      // Sin verificación remota activa no hay petición pendiente que contestar.
      if (acs['remoteCheckDoorEnabled'] !== true) return respuestaDe(200, NO_SOPORTA);
      const cuerpo = String(opciones?.body ?? '');
      veredictosRecibidos.push(cuerpo);
      // 15-L · la terminal ACTÚA: abre con `success` a tiempo y con su serie.
      if (verificacion.contestar(cuerpo) === 'abrio') {
        anotarEn(aperturasFisicasPor, guion.destino);
      }
      return respuestaDe(200, OK);
    }
    if (catalogada.proposito === 'leer qué admite la biblioteca de rostros') {
      return respuestaDe(
        200,
        JSON.stringify({
          FDLibCap: {
            maxFDRecordNum: guion.bibliotecaMaximo ?? 5000,
            ...(guion.operacionesDeBiblioteca === undefined
              ? {}
              : { supportFunction: { '@opt': guion.operacionesDeBiblioteca } }),
          },
        }),
      );
    }
    if (catalogada.proposito === 'contar las plantillas de la biblioteca de rostros') {
      // Como la guía: `recordDataNumber` por biblioteca, con su ResponseStatus.
      return respuestaDe(
        200,
        JSON.stringify({
          statusCode: 1,
          statusString: 'ok',
          subStatusCode: 'ok',
          FDRecordDataInfo: [
            { FDID: '1', faceLibType: 'blackFD', recordDataNumber: enBiblioteca() },
          ],
        }),
      );
    }
    if (catalogada.proposito === 'buscar una plantilla en la biblioteca de rostros') {
      const pedido = /"FPID"\s*:\s*"([^"]+)"/.exec(String(opciones?.body ?? ''))?.[1] ?? null;
      const encontrada = pedido !== null && plantillas.has(pedido);
      return respuestaDe(
        200,
        JSON.stringify({
          MatchList: encontrada ? [{ FPID: pedido }] : [],
          numOfMatches: encontrada ? 1 : 0,
          totalMatches: encontrada ? 1 : 0,
        }),
      );
    }
    if (catalogada.proposito === 'dar de baja a la persona y con ella su plantilla') {
      // 15-K (§5) · la persona se lleva su rostro: la plantilla deja de estar.
      // Como la guía: `mode` es requerido, y borrar a quien no está no es error.
      const cuerpo = String(opciones?.body ?? '');
      const empleado = /"employeeNo"\s*:\s*"([^"]*)"/.exec(cuerpo)?.[1];
      if (empleado === undefined || !/"mode"\s*:\s*"byEmployeeNo"/.test(cuerpo)) {
        return respuestaDe(400, PARAMETRO_MALO);
      }
      plantillas.delete(empleado);
      personas.delete(empleado);
      return respuestaDe(200, OK);
    }
    if (
      catalogada.proposito === 'dar de alta la persona a la que pertenece la plantilla' ||
      catalogada.proposito === 'modificar la persona a la que pertenece la plantilla'
    ) {
      // H-SITIO-04 · como la guía: el `employeeNo` admite hasta 32 bytes. A2 ·
      // y el registro entero se valida y se RECUERDA, con su vigencia.
      const leida = leerPersona(String(opciones?.body ?? ''));
      if (leida === null) return respuestaDe(400, PARAMETRO_MALO);
      // E3 (15-M) · un `userType` que el equipo no declara: `badParameters`.
      if (!declara(guion.tiposDePersona ?? 'normal,visitor,blackList', leida.persona.tipo)) {
        return respuestaDe(400, PARAMETRO_MALO);
      }
      const alta = catalogada.proposito.startsWith('dar de alta');
      if (alta && personas.has(leida.id)) return respuestaDe(400, PERSONA_YA_EXISTE);
      if (!alta && !personas.has(leida.id)) return respuestaDe(400, PERSONA_NO_EXISTE);
      personas.set(leida.id, leida.persona);
      return respuestaDe(200, OK);
    }
    if (
      catalogada.proposito === 'cargar la plantilla facial' ||
      catalogada.proposito === 'añadir la plantilla facial a la biblioteca'
    ) {
      // E3 (15-M) · la operación que la biblioteca no declara: `notSupport`.
      const operacion = catalogada.proposito.startsWith('cargar') ? 'setUp' : 'post';
      if (
        guion.operacionesDeBiblioteca !== undefined &&
        !declara(guion.operacionesDeBiblioteca, operacion)
      ) {
        return respuestaDe(200, NO_SOPORTA);
      }
      const maximo = guion.bibliotecaMaximo ?? 5000;
      if (enBiblioteca() >= maximo) return respuestaDe(400, LLENA);
      const cuerpo = Buffer.isBuffer(opciones?.body)
        ? opciones.body.toString('latin1')
        : String(opciones?.body ?? '');
      /**
       * H-SITIO-04 · el formulario de la guía: registro PLANO con `faceLibType`
       * y `FDID`, `FPID` de letras y dígitos, y la imagen en la parte `img`.
       * Lo demás, `400` con los cuatro campos, como el equipo de sitio.
       */
      const fpid = /"FPID"\s*:\s*"([^"]+)"/.exec(cuerpo)?.[1];
      const conforme =
        /"faceLibType"\s*:/.test(cuerpo) &&
        /"FDID"\s*:/.test(cuerpo) &&
        !/\{\s*"FaceDataRecord"\s*:/.test(cuerpo) &&
        /name="img"/.test(cuerpo) &&
        fpid !== undefined &&
        /^[A-Za-z0-9]{1,63}$/.test(fpid);
      if (!conforme) return respuestaDe(400, PARAMETRO_MALO);
      // A2 (15-L) · el rostro se enlaza a una persona por `FPID` = `employeeNo`:
      // sin persona previa, el equipo no tiene a quién dárselo.
      if (!personas.has(fpid)) return respuestaDe(400, PERSONA_NO_EXISTE);
      plantillas.add(fpid);
      return respuestaDe(200, OK);
    }
    if (catalogada.proposito === 'suprimir la plantilla facial') {
      const cuerpo = String(opciones?.body ?? '');
      for (const m of cuerpo.matchAll(/"value"\s*:\s*"([^"]+)"/g)) {
        const id = m[1];
        if (id !== undefined) plantillas.delete(id);
      }
      return respuestaDe(200, OK);
    }
    if (catalogada.proposito === 'enviar audio al equipo') {
      const cuerpo = opciones?.body;
      if (cuerpo instanceof Uint8Array) audioRecibido.push(cuerpo);
      // A4 · el adaptador sube el audio como UN flujo que dura la sesión: el
      // equipo lo lee según llega, como el real, y contesta en el acto.
      if (cuerpo instanceof ReadableStream) {
        const lector = (cuerpo as ReadableStream<Uint8Array>).getReader();
        void (async () => {
          for (;;) {
            const { done, value } = await lector
              .read()
              .catch(() => ({ done: true, value: undefined }));
            if (done === true) return;
            if (value !== undefined) audioRecibido.push(value);
          }
        })();
      }
      return respuestaDe(200, '');
    }
    if (catalogada.proposito === 'recibir audio del equipo') {
      // Lo que el flujo de subida ya entregó se vuelca aquí; un tic deja que
      // el lector del flujo apunte lo último que llegó.
      await new Promise((listo) => setTimeout(listo, 0));
      const respuesta = respuestaDe(200, '');
      const trozos = audioRecibido.splice(0, audioRecibido.length);
      Object.defineProperty(respuesta, 'body', { value: cuerpoBinario(trozos) });
      return respuesta;
    }
    if (
      catalogada.proposito === 'abrir la puerta desde la plataforma' ||
      catalogada.proposito === 'abrir la puerta del videoportero'
    ) {
      // Anexo 15-K · H-SITIO-13 · sin espacio de nombres ni versión, «OK» y el
      // relé no se mueve; con ellos, abre. Sólo el equipo sabe la diferencia.
      const desenlace = desenlaceDeApertura(String(opciones?.body ?? ''));
      if (desenlace === 'mal_formada') return respuestaDe(400, CONTENIDO_XML_MALO);
      // J (15-L) · engañosa 3: 2xx sin `statusCode 1`, y el relé quieto.
      if (guion.aperturaSinConfirmar === true) return respuestaDe(200, '');
      if (desenlace === 'acciona') anotarEn(aperturasFisicasPor, guion.destino);
      return respuestaDe(200, OK);
    }
    if (catalogada.proposito === 'accionar la barrera vehicular') {
      // J (15-L) · el oráculo de la talanquera, como el de las puertas.
      if (guion.aperturaSinConfirmar === true) return respuestaDe(200, '');
      if (/<ctrlMode>\s*open\s*<\/ctrlMode>/.test(String(opciones?.body ?? ''))) {
        anotarEn(aperturasFisicasPor, guion.destino);
      }
      return respuestaDe(200, OK);
    }
    if (catalogada.proposito === 'contestar o rechazar una llamada del videoportero') {
      return respuestaDe(200, guion.senalizaLlamadas === true ? OK : NO_SOPORTA);
    }
    if (
      catalogada.proposito === 'suscribirse a los eventos del equipo' ||
      catalogada.proposito === 'escuchar los eventos que el equipo emite'
    ) {
      const respuesta = respuestaDe(200, '');
      Object.defineProperty(respuesta, 'body', { value: flujoDeEventos() });
      return respuesta;
    }

    if (catalogada.proposito === 'leer quién controla la barrera: la cámara o la plataforma') {
      return respuestaDe(200, entranceParam({ ...guion, ctrlMod: modoDeControl }));
    }
    if (catalogada.proposito === 'corregir quién controla la barrera') {
      // Leer-modificar-escribir de verdad, como la verificación remota: lo que
      // se escribe es lo que la siguiente lectura devuelve.
      const pedido = /<ctrlMode?>\s*([012])\s*</.exec(String(opciones?.body ?? ''))?.[1];
      if (pedido === undefined) return respuestaDe(400, PARAMETRO_MALO);
      modoDeControl = pedido as '0' | '1' | '2';
      return respuestaDe(200, OK);
    }

    if (catalogada.proposito === 'leer si un disparador vinculado acciona la barrera') {
      return respuestaDe(200, disparador(guion));
    }

    if (catalogada.proposito === 'leer el país con el que el algoritmo lee las placas') {
      return respuestaDe(200, datosBasicos(guion));
    }

    if (catalogada.proposito === 'leer qué países admite el algoritmo de este equipo') {
      return respuestaDe(200, CAPACIDADES_DE_CANAL);
    }

    if (catalogada.proposito === 'leer a qué receptor publica el equipo') {
      return respuestaDe(200, documentoDelReceptor(receptor));
    }
    if (
      catalogada.proposito === 'apuntar el equipo a nuestro receptor' ||
      catalogada.proposito === 'apuntar un receptor concreto por su identificador'
    ) {
      const escrito = receptorEscrito(receptor, String(opciones?.body ?? ''));
      if (escrito === null) return respuestaDe(400, PARAMETRO_MALO);
      receptor = escrito;
      return respuestaDe(200, OK);
    }

    if (catalogada.proposito === 'leer si este modelo reporta el estado de la barrera') {
      return respuestaDe(
        200,
        '<?xml version="1.0" encoding="UTF-8"?><BarrierGateCap version="2.0" ' +
          'xmlns="http://www.isapi.org/ver20/XMLSchema">' +
          `<isSupportBarrierGateStatus>${guion.reportaEstadoDeBarrera === false ? 'false' : 'true'}` +
          '</isSupportBarrierGateStatus></BarrierGateCap>',
      );
    }

    if (catalogada.proposito === 'leer si la barrera está abierta o cerrada') {
      return respuestaDe(
        200,
        '<?xml version="1.0" encoding="UTF-8"?><BarrierGateStatus version="2.0" ' +
          'xmlns="http://www.isapi.org/ver20/XMLSchema">' +
          `<barrierGateStatus>${guion.estadoDeBarrera ?? '1'}</barrierGateStatus>` +
          '</BarrierGateStatus>',
      );
    }

    if (catalogada.proposito === 'leer las capacidades del equipo') {
      return respuestaDe(200, capacidadesDelSistema(guion));
    }

    if (catalogada.proposito === 'leer las capacidades de tráfico del equipo') {
      /**
       * `declaraReconocimiento: false` apaga **las cuatro** señales, no una.
       * El fabricante dice que basta con que se cumpla UNA, así que un guion
       * que sólo apagara la del sistema seguiría declarando reconocimiento por
       * ésta — y la prueba que quisiera un equipo incapaz obtendría uno capaz.
       */
      return respuestaDe(
        200,
        guion.declaraReconocimiento === false
          ? '<?xml version="1.0" encoding="UTF-8"?><TrafficCap version="2.0" ' +
              'xmlns="http://www.isapi.org/ver20/XMLSchema"/>'
          : '<?xml version="1.0" encoding="UTF-8"?><TrafficCap version="2.0" ' +
              'xmlns="http://www.isapi.org/ver20/XMLSchema"><plateCap>' +
              '<CRIndex opt="0,210,253,254"/></plateCap></TrafficCap>',
      );
    }

    if (catalogada.proposito === 'leer la hora del equipo') {
      return respuestaDe(
        200,
        '<?xml version="1.0" encoding="UTF-8"?><Time version="2.0" ' +
          'xmlns="http://www.isapi.org/ver20/XMLSchema"><timeMode>manual</timeMode>' +
          // R2 (15-N) · por omisión, un reloj EN HORA (el real del proceso): un
          // equipo con 56 años de desvío frenaría toda alta con vigencia.
          `<localTime>${guion.hora ?? new Date().toISOString()}</localTime>` +
          '<timeZone>CST+5:00:00</timeZone></Time>',
      );
    }

    if (
      catalogada.proposito === 'saber si hay un equipo en esa dirección, sin presentar credenciales'
    ) {
      return respuestaDe(200, '<ActivateStatus><activated>true</activated></ActivateStatus>');
    }

    if (catalogada.proposito === 'leer la identidad del equipo (modelo, firmware, serie)') {
      return respuestaDe(
        200,
        `<DeviceInfo><model>${guion.modelo ?? 'SIMULADO'}</model>` +
          `<firmwareVersion>${guion.firmware ?? 'V0.0.0'}</firmwareVersion>` +
          `<serialNumber>${guion.serie ?? 'SIM0000001'}</serialNumber></DeviceInfo>`,
      );
    }

    return respuestaDe(200, OK);
  }) as typeof fetch;
  return guion.situaciones === undefined
    ? equipo
    : conSituacionesDeSitio(equipo, guion.situaciones);
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * VARIOS EQUIPOS A LA VEZ, CADA UNO CON SU FAMILIA
 *
 * Un solo simulado responde a las rutas de UNA familia y contesta `404` a las
 * demás — que es lo correcto: una cámara no tiene biblioteca de rostros. Pero
 * el proveedor real atiende a los tres tipos con el mismo transporte inyectado,
 * así que probarlo con un simulado de una sola familia produce un `404` que
 * parece un defecto del adaptador y es del banco.
 *
 * Esto reparte por **dirección**, igual que la red: cada equipo tiene la suya y
 * contesta lo suyo. Un destino que nadie declaró da `404`, que es lo que da una
 * dirección donde no hay nada.
 */
export const equiposSimulados = (porDestino: Record<string, GuionDeEquipo>): typeof fetch => {
  const simulados = new Map<string, typeof fetch>(
    // El rótulo de cada equipo es su dirección, salvo que el guion diga otro:
    // así el oráculo (`aperturasFisicasPor`) sabe de quién habla.
    Object.entries(porDestino).map(([destino, guion]) => [
      destino,
      equipoSimulado({ destino, ...guion }),
    ]),
  );
  return (async (entrada: string | URL, opciones?: RequestInit): Promise<Response> => {
    const url = new URL(typeof entrada === 'string' ? entrada : String(entrada));
    const simulado = simulados.get(url.hostname);
    if (simulado === undefined) return respuestaDe(404, 'no hay ningún equipo en esa dirección');
    return simulado(entrada, opciones);
  }) as typeof fetch;
};

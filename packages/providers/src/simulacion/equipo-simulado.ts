import { createHash } from 'node:crypto';
import { RUTAS } from '../equipo/catalogo-de-rutas';
import type { RutaDeEquipo } from '../equipo/catalogo-de-rutas';

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
 *   cuenta del equipo.
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
  /** `false` → `AcsCfg.remoteCheck=false`: la terminal decide sola. */
  readonly verificacionRemota?: boolean;
  /** Rótulo para consultar después qué veredictos recibió (A2). Opcional. */
  readonly destino?: string;
  /** Capacidad y ocupación de la biblioteca de rostros. */
  readonly bibliotecaMaximo?: number;
  readonly bibliotecaAlmacenadas?: number;
  /** Órdenes que la puerta admite desde la plataforma. */
  readonly ordenesDePuerta?: readonly string[];
  /** El equipo no contesta a la consulta de capacidades: todo queda DESCONOCIDO. */
  readonly sinCapacidades?: boolean;
  /** Desenlaces de error, cada uno con su código del fabricante. */
  readonly ocupado?: boolean;
  readonly averiado?: boolean;
  readonly reinicioNecesario?: boolean;
  /** Rechaza la credencial aunque el Digest sea correcto: cuenta bloqueada. */
  readonly rechazaCredencial?: boolean;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS DOCUMENTOS SON LOS DE LA GUÍA, LITERALES
 *
 * No están escritos «como nos conviene»: llevan los nombres de elemento, el
 * espacio de nombres y las erratas del esquema del fabricante. Un simulado que
 * respondiera lo que el analizador espera no probaría el analizador — probaría
 * que dos ficheros nuestros se entienden entre sí.
 *
 * De ahí que el documento de parámetros de entrada traiga la lista de políticas
 * de vehículo y la de relés aunque la mayoría de las pruebas no las miren: es
 * lo que el equipo manda, y leerlo entero es justo lo que la 15-C añadió.
 */
const ESPACIO = 'http://www.isapi.org/ver20/XMLSchema';

const entranceParam = (guion: GuionDeEquipo): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<EntranceParamList version="2.0" xmlns="${ESPACIO}">`,
    '<EntranceParam>',
    '<laneNum>1</laneNum>',
    '<bEnable>true</bEnable>',
    `<ctrlMode>${guion.ctrlMod ?? '1'}</ctrlMode>`,
    '<relateTriggerMode>vehicleDetect</relateTriggerMode>',
    '<vehInfoManagList>',
    '<vehInfoManag>',
    '<vehInfoManagNum>1</vehInfoManagNum>',
    '<barrierGateOper>off</barrierGateOper>',
    '<upAlarmEnable>true</upAlarmEnable>',
    '<hostUpAlarmEnable>true</hostUpAlarmEnable>',
    '</vehInfoManag>',
    '<vehInfoManag>',
    '<vehInfoManagNum>2</vehInfoManagNum>',
    `<barrierGateOper>${guion.operacionDeListaBlanca ?? 'off'}</barrierGateOper>`,
    '<upAlarmEnable>true</upAlarmEnable>',
    '<hostUpAlarmEnable>true</hostUpAlarmEnable>',
    '</vehInfoManag>',
    '</vehInfoManagList>',
    '<relayList><relay>',
    '<relayNum>1</relayNum>',
    '<relayFunction>1</relayFunction>',
    '</relay></relayList>',
    `<notCloseCarFollow>${guion.noCierraConVehiculosPegados === true ? 'true' : 'false'}</notCloseCarFollow>`,
    '<bigCarKeepOpen><enabled>false</enabled><duration>1</duration></bigCarKeepOpen>',
    '<ParkingDetection><enabled>false</enabled><judgeTime>1</judgeTime></ParkingDetection>',
    '</EntranceParam>',
    '</EntranceParamList>',
  ].join('');

const disparador = (guion: GuionDeEquipo): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<EventTrigger version="2.0" xmlns="${ESPACIO}">`,
    '<id>vehicledetection-1</id>',
    '<eventType>vehicledetection</eventType>',
    '<EventTriggerNotificationList>',
    '<EventTriggerNotification>',
    '<id>1</id>',
    '<notificationMethod>center</notificationMethod>',
    '</EventTriggerNotification>',
    ...(guion.disparadorAccionaPuerto === undefined
      ? []
      : [
          '<EventTriggerNotification>',
          '<id>2</id>',
          '<notificationMethod>IO</notificationMethod>',
          `<outputIOPortID>${guion.disparadorAccionaPuerto}</outputIOPortID>`,
          '</EventTriggerNotification>',
        ]),
    '</EventTriggerNotificationList>',
    '</EventTrigger>',
  ].join('');

const datosBasicos = (guion: GuionDeEquipo): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<BasicInfo version="2.0" xmlns="${ESPACIO}">`,
    '<channelID>1</channelID>',
    '<directionNo>Upward</directionNo>',
    '<monitoringSiteID>SITIO1</monitoringSiteID>',
    '<deviceID>EQUIPO1</deviceID>',
    '<monitorDescription>ENTRADA</monitorDescription>',
    '<defaultCHN>1</defaultCHN>',
    '<region>other</region>',
    `<CRIndex>${guion.indiceDePais ?? '210'}</CRIndex>`,
    '</BasicInfo>',
  ].join('');

const CAPACIDADES_DE_CANAL = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  `<BasicInfoCap version="2.0" xmlns="${ESPACIO}">`,
  '<channelID opt="1"/>',
  '<region opt="default,EU,CIS,EU_CIS,ME"/>',
  '<CRIndex opt="0,210,253,254"/>',
  '</BasicInfoCap>',
].join('');

const receptor = (guion: GuionDeEquipo): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<HttpHostNotificationList version="2.0" xmlns="${ESPACIO}">`,
    '<HttpHostNotification>',
    '<id>1</id>',
    '<url>/alarm-server</url>',
    '<protocolType>HTTP</protocolType>',
    `<parameterFormatType>${guion.formatoDeNotificacion ?? 'XML'}</parameterFormatType>`,
    '<addressingFormatType>ipaddress</addressingFormatType>',
    '<ipAddress>198.51.100.10</ipAddress>',
    '<portNo>3000</portNo>',
    '<httpAuthenticationMethod>none</httpAuthenticationMethod>',
    '<ANPR>',
    `<detectionUpLoadPicturesType>${guion.imagenesDelEvento ?? 'detectionPicture'}</detectionUpLoadPicturesType>`,
    '</ANPR>',
    '</HttpHostNotification>',
    '</HttpHostNotificationList>',
  ].join('');

/**
 * El documento de capacidades, con las claves de los VOLCADOS REALES del
 * 23/09/2026 (`docs/insumos/hikvision/hik-*.xml`): `ITCCap` en la cámara,
 * `VideoIntercomCap` y `AudioCap` en el videoportero, `isSupportSubscribeEvent`
 * en los dos. Lo que el simulado declara se lee con el mismo lector que leerá
 * el aparato.
 */
const capacidadesDelSistema = (guion: GuionDeEquipo): string => {
  const canales = guion.canalesDeAudio ?? CANALES_POR_OMISION;
  const conAudio = canales.length > 0;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<DeviceCap version="2.0" xmlns="${ESPACIO}">`,
    '<SysCap>',
    ...(guion.familia === 'camara'
      ? []
      : [
          '<AudioCap>',
          `<audioInputNums>${conAudio ? '1' : '0'}</audioInputNums>`,
          `<audioOutputNums>${conAudio ? '1' : '0'}</audioOutputNums>`,
          '</AudioCap>',
        ]),
    `<isSupportSubscribeEvent>${guion.admiteSuscripcion === false ? 'false' : 'true'}</isSupportSubscribeEvent>`,
    '</SysCap>',
    ...(guion.familia === 'camara'
      ? [
          '<ITCCap>',
          `<isSupportVehicleDetection>${guion.declaraReconocimiento === false ? 'false' : 'true'}</isSupportVehicleDetection>`,
          '</ITCCap>',
        ]
      : [
          '<VideoIntercomCap>',
          `<isSupportRemoteOpenDoor>${guion.aperturaRemota === false ? 'false' : 'true'}</isSupportRemoteOpenDoor>`,
          `<isSupportCallSignal>${guion.senalizaLlamadas === true ? 'true' : 'false'}</isSupportCallSignal>`,
          '</VideoIntercomCap>',
        ]),
    '</DeviceCap>',
  ].join('');
};

/** Un canal habilitado con G.711 µ-law: lo que el equipo real declara, salvo que viene deshabilitado. */
const CANALES_POR_OMISION = [{ id: 1, habilitado: true, codec: 'G.711ulaw' }] as const;

const canalesDeAudio = (guion: GuionDeEquipo): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<TwoWayAudioChannelList version="2.0" xmlns="${ESPACIO}">`,
    ...(guion.canalesDeAudio ?? CANALES_POR_OMISION).map(
      (c) =>
        `<TwoWayAudioChannel><id>${String(c.id)}</id><enabled>${c.habilitado ? 'true' : 'false'}</enabled>` +
        `<audioCompressionType>${c.codec ?? 'G.711ulaw'}</audioCompressionType>` +
        '<audioInputType>MicIn</audioInputType><speakerVolume>50</speakerVolume>' +
        '<noisereduce>false</noisereduce></TwoWayAudioChannel>',
    ),
    '</TwoWayAudioChannelList>',
  ].join('');

const ordenesDePuerta = (guion: GuionDeEquipo): string =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  `<RemoteControlDoorCap version="2.0" xmlns="${ESPACIO}">` +
  `<cmd opt="${(guion.ordenesDePuerta ?? ['open', 'close']).join(',')}"/>` +
  '</RemoteControlDoorCap>';

/** Respuestas de error con el código de estado general del fabricante. */
const ERROR_OCUPADO =
  '<ResponseStatus><statusCode>2</statusCode><statusString>Device Busy</statusString>' +
  '<subStatusCode>deviceBusy</subStatusCode></ResponseStatus>';
const ERROR_AVERIADO =
  '<ResponseStatus><statusCode>3</statusCode><statusString>Device Error</statusString></ResponseStatus>';
const ERROR_REINICIO =
  '<ResponseStatus><statusCode>7</statusCode><statusString>Reboot Required</statusString></ResponseStatus>';
const LLENA = '{"statusCode":6,"statusString":"Invalid Content","subStatusCode":"faceLibraryFull"}';

const md5 = (t: string): string => createHash('md5').update(t, 'utf8').digest('hex');

const OK =
  '<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString></ResponseStatus>';
const NO_SOPORTA =
  '<ResponseStatus><statusCode>4</statusCode><statusString>notSupport</statusString></ResponseStatus>';

/** Lo que el equipo contesta al primer intento: el desafío. */
const REINO = 'equipo-simulado';
const NONCE = 'nonce-de-prueba';

const respuestaDe = (
  estado: number,
  cuerpo: string,
  cabeceras: Record<string, string> = {},
): Response =>
  ({
    status: estado,
    ok: estado >= 200 && estado < 300,
    headers: new Headers(cabeceras),
    text: async () => cuerpo,
    body: null,
  }) as unknown as Response;

/** Comprueba la respuesta Digest como lo haría el aparato. */
const digestCorrecto = (
  autorizacion: string | null,
  metodo: string,
  guion: GuionDeEquipo,
): boolean => {
  if (autorizacion === null || !/^digest /i.test(autorizacion)) return false;
  const valor = (nombre: string): string =>
    new RegExp(`${nombre}="?([^",]+)"?`).exec(autorizacion)?.[1] ?? '';
  const uri = valor('uri');
  const ha1 = md5(`${guion.usuario}:${REINO}:${guion.clave}`);
  const ha2 = md5(`${metodo}:${uri}`);
  const qop = valor('qop');
  const esperado =
    qop === ''
      ? md5(`${ha1}:${NONCE}:${ha2}`)
      : md5(`${ha1}:${NONCE}:${valor('nc')}:${valor('cnonce')}:${qop}:${ha2}`);
  return valor('response') === esperado;
};

/** Flujo de eventos: los bloques, uno detrás de otro, y después se cierra. */
const cuerpoDeFlujo = (bloques: readonly Record<string, unknown>[]): ReadableStream<Uint8Array> => {
  const codificador = new TextEncoder();
  let i = 0;
  return {
    getReader: () => ({
      read: async () =>
        i < bloques.length
          ? { done: false, value: codificador.encode(JSON.stringify(bloques[i++])) }
          : { done: true, value: undefined },
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

/**
 * Devuelve un `fetch` que se comporta como el equipo descrito.
 *
 * Se inyecta en cualquier adaptador —todos aceptan `peticion`— y con él la
 * suite recorre el camino entero sin un solo aparato.
 */
/**
 * ¿Casa la ruta del catálogo con el camino pedido? Las rutas con `{canal}` se
 * comparan como patrón: el simulado acepta cualquier número, igual que el
 * aparato acepta cualquier canal que exista. Qué canal era el bueno lo decide
 * la prueba mirando la petición, no el emparejamiento.
 */
const caminoCasa = (rutaDelCatalogo: string, camino: string): boolean => {
  const base = rutaDelCatalogo.split('?')[0] ?? rutaDelCatalogo;
  if (!base.includes('{canal}')) return base === camino;
  const patron = new RegExp(
    '^' +
      base
        .split('{canal}')
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\d+') +
      '$',
  );
  return patron.test(camino);
};

/** Lo que cada terminal simulada recibió como veredicto, por destino (A2). */
export const veredictosRecibidosPor = new Map<string, string[]>();

export const equipoSimulado = (guion: GuionDeEquipo): typeof fetch => {
  /** Estado mutable del equipo: la corrección lo cambia y la lectura lo ve. */
  let verificacionRemota = guion.verificacionRemota !== false;
  const veredictosRecibidos: string[] = [];
  if (guion.destino !== undefined) veredictosRecibidosPor.set(guion.destino, veredictosRecibidos);
  const sinSoporte = new Set(guion.sinSoporte ?? []);
  /** Estado de la biblioteca de rostros: lo que se carga se cuenta y se busca. */
  const plantillas = new Set<string>();
  const almacenadasSinNombre = guion.bibliotecaAlmacenadas ?? 0;
  const enBiblioteca = (): number => almacenadasSinNombre + plantillas.size;
  /** Audio recibido, para devolverlo como eco por el flujo de salida. */
  const audioRecibido: Uint8Array[] = [];

  return (async (entrada: string | URL, opciones?: RequestInit): Promise<Response> => {
    const url = new URL(typeof entrada === 'string' ? entrada : String(entrada));
    const metodo = opciones?.method ?? 'GET';
    const cabeceras = (opciones?.headers ?? {}) as Record<string, string>;

    // Primer viaje: sin credenciales, el equipo contesta con su desafío. Y con
    // la cuenta bloqueada contesta 401 aunque el Digest sea correcto.
    if (
      guion.rechazaCredencial === true ||
      !digestCorrecto(cabeceras['authorization'] ?? null, metodo, guion)
    ) {
      return respuestaDe(401, '', {
        'www-authenticate': `Digest realm="${REINO}", nonce="${NONCE}", qop="auth"`,
      });
    }

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
        caminoCasa(r.ruta, url.pathname) && (r.familia === guion.familia || r.familia === 'comun'),
    );
    const catalogada = delMismoCamino.find((r) => r.metodo === metodo) ?? delMismoCamino[0];

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

    if (catalogada.proposito === 'leer los canales de audio bidireccional del equipo') {
      return respuestaDe(200, canalesDeAudio(guion));
    }
    if (catalogada.proposito === 'leer qué órdenes admite la puerta desde la plataforma') {
      return respuestaDe(200, ordenesDePuerta(guion));
    }
    if (catalogada.proposito === 'leer si la terminal espera el veredicto de la plataforma') {
      return respuestaDe(200, JSON.stringify({ AcsCfg: { remoteCheck: verificacionRemota } }));
    }
    if (catalogada.proposito === 'fijar que la terminal espere el veredicto de la plataforma') {
      // Leer-modificar-escribir de verdad: lo que se escribe es lo que la
      // siguiente lectura devuelve. Sin esto, la corrección parecería aplicada
      // y la ficha seguiría en bloqueo.
      const cuerpo = String(opciones?.body ?? '');
      const pedido = /"remoteCheck"\s*:\s*(true|false)/.exec(cuerpo)?.[1];
      if (pedido === undefined) return respuestaDe(400, ERROR_AVERIADO);
      verificacionRemota = pedido === 'true';
      return respuestaDe(200, OK);
    }
    if (catalogada.proposito === 'responder la verificación remota de la terminal') {
      // Sin verificación remota activa no hay petición pendiente que contestar.
      if (!verificacionRemota) return respuestaDe(200, NO_SOPORTA);
      const cuerpo = String(opciones?.body ?? '');
      veredictosRecibidos.push(cuerpo);
      return respuestaDe(200, OK);
    }
    if (catalogada.proposito === 'leer qué admite la biblioteca de rostros') {
      return respuestaDe(
        200,
        JSON.stringify({ FDLibCap: { maxFDRecordNum: guion.bibliotecaMaximo ?? 5000 } }),
      );
    }
    if (catalogada.proposito === 'contar las plantillas de la biblioteca de rostros') {
      return respuestaDe(200, JSON.stringify({ FDRecordCount: { totalNum: enBiblioteca() } }));
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
    if (catalogada.proposito === 'cargar la plantilla facial') {
      const maximo = guion.bibliotecaMaximo ?? 5000;
      if (enBiblioteca() >= maximo) return respuestaDe(400, LLENA);
      const cuerpo = Buffer.isBuffer(opciones?.body)
        ? opciones.body.toString('latin1')
        : String(opciones?.body ?? '');
      const fpid = /"FPID"\s*:\s*"([^"]+)"/.exec(cuerpo)?.[1];
      if (fpid !== undefined) plantillas.add(fpid);
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
      return respuestaDe(200, '');
    }
    if (catalogada.proposito === 'recibir audio del equipo') {
      const respuesta = respuestaDe(200, '');
      const trozos = audioRecibido.splice(0, audioRecibido.length);
      Object.defineProperty(respuesta, 'body', { value: cuerpoBinario(trozos) });
      return respuesta;
    }
    if (catalogada.proposito === 'contestar o rechazar una llamada del videoportero') {
      return respuestaDe(200, guion.senalizaLlamadas === true ? OK : NO_SOPORTA);
    }
    if (catalogada.proposito === 'suscribirse a los eventos del equipo') {
      const respuesta = respuestaDe(200, '');
      Object.defineProperty(respuesta, 'body', { value: cuerpoDeFlujo(guion.flujo ?? []) });
      return respuesta;
    }

    if (catalogada.proposito === 'escuchar los eventos que el equipo emite') {
      const respuesta = respuestaDe(200, '');
      Object.defineProperty(respuesta, 'body', { value: cuerpoDeFlujo(guion.flujo ?? []) });
      return respuesta;
    }

    if (catalogada.proposito === 'leer quién controla la barrera: la cámara o la plataforma') {
      return respuestaDe(200, entranceParam(guion));
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
      return respuestaDe(200, receptor(guion));
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
          `<localTime>${guion.hora ?? new Date(0).toISOString()}</localTime>` +
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
          '<serialNumber>SIM0000001</serialNumber></DeviceInfo>',
      );
    }

    return respuestaDe(200, OK);
  }) as typeof fetch;
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
    Object.entries(porDestino).map(([destino, guion]) => [destino, equipoSimulado(guion)]),
  );
  return (async (entrada: string | URL, opciones?: RequestInit): Promise<Response> => {
    const url = new URL(typeof entrada === 'string' ? entrada : String(entrada));
    const simulado = simulados.get(url.hostname);
    if (simulado === undefined) return respuestaDe(404, 'no hay ningún equipo en esa dirección');
    return simulado(entrada, opciones);
  }) as typeof fetch;
};

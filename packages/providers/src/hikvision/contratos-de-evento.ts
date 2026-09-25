/**
 * Los DOS contratos de evento de Hikvision, y por qué son dos.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * PROCEDENCIA · léalo antes de confiar en nada de aquí
 *
 * La **forma** de los dos contratos —quién inicia la conexión, qué transporte,
 * qué campos gobiernan— procede de la validación en sitio del 15/09/2026
 * (`docs/guias/VALIDACION_HIKVISION_EN_SITIO.md` §0.quater). Los **valores
 * concretos** de los ejemplos de abajo son inventados y están marcados: no hay
 * una captura pegada en el repositorio todavía, y fabricar una y llamarla
 * medición sería exactamente el tipo de falso verde que este proyecto persigue.
 *
 * Lo que esto habilita hoy: escribir y probar la normalización —que es donde
 * viven los defectos— contra la forma real, en vez de contra una inventada. Lo
 * que NO afirma: que el XML de su cámara traiga exactamente estas etiquetas.
 * La ETAPA 15 pega las capturas y ajusta los selectores; el contrato de salida
 * ya no se mueve.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA DIFERENCIA QUE MANDA SOBRE EL DISEÑO
 *
 * | Equipo                 | Quién inicia        | Transporte              | Formato |
 * | ---------------------- | ------------------- | ----------------------- | ------- |
 * | **Cámara ANPR**        | **El equipo**       | POST al «Alarm Server»  | XML     |
 * | **Videoportero**       | **Nuestro sistema** | GET a `alertStream`     | JSON    |
 *
 * No es una diferencia de gusto: son dos direcciones de conexión opuestas y por
 * tanto dos adaptadores distintos en la ETAPA 15. La cámara **empuja** —de ahí
 * que el Alarm Server viva en la capa de presentación, como decidió la auditoría
 * de arquitectura, y que necesite firma (RNF-03)—. El videoportero **no
 * empuja**: hay que ir a buscarlo y mantener la conexión abierta, con
 * reconexión, que es trabajo de infraestructura.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Y EL DETALLE QUE ARRUINA UNA PUESTA EN MARCHA SI SE IGNORA
 *
 * `alertStream` **vuelca todo el historial al conectar**, marcado con
 * `currentEvent: false`, antes de empezar a emitir en tiempo real. Un adaptador
 * que no lo distinga procesará como «está llamando ahora» cada timbrazo de las
 * últimas semanas: alertas al operador, eventos falsos en una tabla que es
 * append-only —no se pueden borrar— y un residente avisado de una visita de
 * hace quince días. `esEventoEnVivo()` de abajo es la línea que lo impide.
 */

/**
 * QUIÉN ABRIÓ, SEGÚN EL PROPIO EQUIPO.
 *
 * Sólo existe cuando el control de barrera del equipo está **habilitado**, y
 * entonces declara si abrió él o nosotros:
 *
 * | Valor      | Significa                                              |
 * | ---------- | ------------------------------------------------------ |
 * | `lista`    | abrió LA CÁMARA por su lista interna de placas        |
 * | `manual`   | abrió la PLATAFORMA, que es lo único admisible        |
 * | `anomalo`  | abrió LA CÁMARA por una excepción suya                |
 *
 * Es **evidencia de auditoría**: la declaración del equipo sobre quién tomó la
 * decisión. Un `lista` o un `anomalo` significan que la cámara está decidiendo
 * y que el motor de reglas se enteró después —o no se enteró—.
 */
export type QuienAbrio = 'lista' | 'manual' | 'anomalo';

/** Recuadro del objeto detectado, tal como lo da el equipo. */
export interface RecuadroDetectado {
  readonly x: number;
  readonly y: number;
  readonly ancho: number;
  readonly alto: number;
}

/**
 * Las clases de evento que el sistema distingue · ampliadas en la 15-D (6.5).
 *
 * | Clase          | Quién la emite            | Qué trae                                 |
 * | -------------- | ------------------------- | ---------------------------------------- |
 * | `placa`        | Cámara ANPR               | placa, confianza, quién abrió            |
 * | `timbre`       | Videoportero              | que alguien pulsó                        |
 * | `llamada`      | Videoportero              | origen de la llamada (edificio/unidad)   |
 * | `rostro`       | Terminal facial           | persona reconocida y si ESPERA veredicto |
 * | `desconocido`  | Cualquiera                | nada que el sistema sepa usar            |
 *
 * `rostro` con `esperaVeredicto: true` es el corazón de la verificación remota
 * (O4): la terminal reconoció y NO abrió, y espera que la plataforma decida.
 */
export type ClaseDeEvento = 'placa' | 'timbre' | 'llamada' | 'rostro' | 'desconocido';

/** Evento normalizado: lo único que sale de este módulo hacia el resto. */
export interface EventoDeEquipo {
  readonly clase: ClaseDeEvento;
  readonly placa: string | null;
  readonly confianza: number | null;
  readonly dispositivoId: string;
  readonly ocurridoEn: Date;
  /** `false` para lo que el equipo declara como HISTÓRICO, no presente. */
  readonly enVivo: boolean;
  /** Identificador del equipo tal como lo emite, para la clave de idempotencia. */
  readonly referenciaDelEquipo: string | null;

  // ── Campos del evento ANPR que el motor y la auditoría necesitan ──────────
  /** `null` cuando el equipo tiene el control de barrera deshabilitado. */
  readonly quienAbrio: QuienAbrio | null;
  readonly tipoDePlaca: string | null;
  readonly colorDePlaca: string | null;
  /** Código de país del equipo. Colombia es 210. */
  readonly pais: number | null;
  readonly carril: number | null;
  readonly sentido: string | null;
  readonly tipoDeVehiculo: string | null;
  readonly tipoDeDeteccion: string | null;
  /** `true` si el equipo considera que la placa cumple el estándar del país. */
  readonly placaEstandar: boolean | null;
  readonly recuadro: RecuadroDetectado | null;
  /**
   * `true` cuando el equipo emitió una hora **sin desplazamiento horario**.
   *
   * No es un detalle de formato: interpretarla en la zona del proceso corre el
   * evento las horas que separen al servidor del conjunto —cinco, en el caso de
   * este proyecto— y el histórico queda desplazado sin que nada falle. Cuando
   * ocurre se usa el reloj inyectado y **se deja esta traza**, que es lo que
   * permite verlo en la puesta en marcha en vez de descubrirlo en una auditoría.
   */
  readonly horaSinDesplazamiento: boolean;
  /**
   * Identificador de la persona que la terminal reconoció (`rostro`). Es el
   * `plantillaId` con el que se dio de alta: la identidad vive en
   * `plantillas_biometricas`, nunca en el aparato. `null` en las demás clases.
   */
  readonly personaId: string | null;
  /**
   * `true` cuando la terminal reconoció y ESPERA el veredicto de la plataforma
   * (verificación remota). `false` cuando decidió sola o no aplica.
   */
  readonly esperaVeredicto: boolean;
  /**
   * A2 · el número con el que la terminal identifica SU petición pendiente. Es
   * lo que hay que devolverle con el veredicto; sin él no sabe a cuál
   * corresponde. `null` fuera de `rostro` o si el equipo no lo emitió.
   */
  readonly serieDelEquipo: number | null;
  /**
   * A2 · `true` cuando el bloque NO es una petición sino el RESULTADO de una
   * verificación remota anterior (`remoteCheckResult`, firmwares de 2024 en
   * adelante). Es informativo: la decisión ya se registró cuando se contestó,
   * y volver a decidirla produciría dos eventos por un mismo hecho.
   */
  readonly esResultadoDeVerificacion: boolean;
  /** De dónde llama (`llamada`): edificio/unidad/periodo tal como los declara. */
  readonly origenDeLlamada: string | null;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE SE IGNORA A PROPÓSITO, Y POR QUÉ SE ESCRIBE AQUÍ
 *
 * El evento ANPR de este fabricante trae, además de la lectura, un bloque
 * entero de **fiscalización de tráfico y analítica de conducta**. Registrarlo
 * sería tratar datos personales que nadie pidió y que ninguna finalidad
 * declarada de este sistema ampara (Ley 1581 art. 4, principio de finalidad):
 * el residente autorizó el control de acceso de su copropiedad, no que se
 * anotara si el conductor llevaba cinturón.
 *
 * No basta con «no leerlos»: se enumeran para que quien añada un campo mañana
 * vea que la omisión fue una DECISIÓN y no un olvido.
 */
export const CAMPOS_IGNORADOS_A_PROPOSITO: readonly string[] = [
  // Fiscalización de tráfico: no somos autoridad de tránsito.
  'illegalInfo',
  'redlightIllegalCode',
  'speedLimit',
  'blackness',
  'noiseDecibel',
  // Analítica de conducta del conductor: datos personales sin finalidad.
  'smoking',
  'phoning',
  'belt',
  'pendant',
  'tissueBox',
  'frontChild',
];

// ─────────────────────────────────────────────────────────────────────────────
// 1 · CÁMARA ANPR · XML que el equipo POSTea al Alarm Server
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrae el primer valor de una etiqueta, sin dependencias.
 *
 * **Sin librería de XML a propósito.** Lo que llega es un documento pequeño y
 * de forma conocida, y un analizador completo traería superficie de ataque
 * —entidades externas, bombas de expansión— en el único endpoint del sistema
 * que acepta cuerpos de un tercero que no se autentica con sesión. La firma
 * (RNF-03) lo protege; no hace falta además exponerlo a XXE.
 */
const etiqueta = (xml: string, nombre: string): string | null => {
  const m = new RegExp(`<(?:\\w+:)?${nombre}>([^<]*)</(?:\\w+:)?${nombre}>`, 'i').exec(xml);
  // `noUncheckedIndexedAccess` (§2.4) obliga a mirar el grupo: un `m[1]` que el
  // compilador no puede probar que exista es justo el `undefined` que se cuela
  // hasta la base como cadena «undefined».
  const capturado = m?.[1];
  return capturado === undefined ? null : capturado.trim();
};

export const esXmlDeAlarmServer = (cuerpo: string): boolean =>
  /<EventNotificationAlert/i.test(cuerpo);

/**
 * `alarmDataType` · **0 en tiempo real · 1 HISTÓRICO**.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL MISMO CRITERIO QUE `esEventoEnVivo`, Y POR EL MISMO MOTIVO
 *
 * Sin filtrarlo, la portería mostraría accesos de hace días como si estuvieran
 * ocurriendo, en una tabla **append-only que no se puede limpiar** (ADR-05).
 *
 * Y un evento que NO declara el campo se trata como **histórico**, igual que
 * allí. Es la dirección segura y hay que saber lo que cuesta: con un firmware
 * que no lo emita, la cámara parece muda y la talanquera no abre. Eso se
 * descubre en la primera prueba y se corrige; lo contrario —eventos falsos en
 * un histórico que es la única prueba que la auditoría acepta— no se corrige
 * nunca. La guía de puesta en marcha dice qué mirar cuando la cámara «no
 * reporta».
 */
export const esDatoEnVivo = (alarmDataType: string | null): boolean => alarmDataType === '0';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * [CORREGIR · 15-C] LA CONFIANZA ES UN PORCENTAJE ENTERO, SIEMPRE
 *
 * El esquema del evento declara `confidenceLevel` como **requerido** y con
 * rango `[0,100]`. No hay firmware que lo emita en fracción: la ambigüedad que
 * este código creía manejar **no existe para ese campo**.
 *
 * Lo que había era una heurística —«si vale más de 1, divide entre 100»— y
 * tenía el peor fallo posible: con una confianza de **1**, que en la escala
 * real significa **uno por ciento**, la condición no se cumple y el valor pasa
 * tal cual, es decir **1.0: certeza total**. Exactamente al revés. La lectura
 * más dudosa que el equipo puede declarar entraba como la más segura, se
 * saltaba el umbral de lectura dudosa (CU-01, excepción 3a) y abría la barrera.
 *
 * Ahora `confidenceLevel` **se divide entre 100 sin condición**. La heurística
 * sobrevive sólo para el alias `confidence`, que el documento no declara: ahí
 * no se sabe la escala, y suponer una de las dos sin base sería repetir el
 * error con otro campo.
 */
export const confianzaDelEvento = (
  nivelDocumentado: string | null,
  aliasNoDocumentado: string | null,
): number | null => {
  if (nivelDocumentado !== null && nivelDocumentado.trim() !== '') {
    const n = Number(nivelDocumentado);
    return Number.isFinite(n) ? n / 100 : null;
  }
  if (aliasNoDocumentado === null || aliasNoDocumentado.trim() === '') return null;
  const n = Number(aliasNoDocumentado);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UNA HORA SIN DESPLAZAMIENTO NO SE INTERPRETA
 *
 * `2026-09-23T10:15:00` sin `Z` ni `+HH:MM` no dice **cuándo** fue: lo dice
 * quien la lee, y quien la lee es un proceso que puede estar en otra zona. Los
 * motores de JavaScript interpretan esa forma en la zona **local del proceso**,
 * así que un servidor en UTC leyendo un equipo en Bogotá corre cada evento
 * **cinco horas**, en silencio y en una tabla que no admite corrección.
 *
 * La salida no es adivinar la zona del equipo: es usar el reloj inyectado —la
 * hora de recepción, que sí es cierta— y **dejar la traza** para que la puesta
 * en marcha lo vea. Perder la precisión de unos milisegundos es barato; un
 * histórico desplazado cinco horas no se arregla nunca.
 */
export const traeDesplazamiento = (marca: string): boolean =>
  /(?:Z|[+-]\d{2}:?\d{2})\s*$/i.test(marca.trim());

/** La hora del equipo cuando es utilizable; la de recepción cuando no lo es. */
export const fechaDelEquipo = (marca: string | null, ahora: Date): Date => {
  if (marca === null || marca.trim() === '') return ahora;
  if (!traeDesplazamiento(marca)) return ahora;
  const analizada = Date.parse(marca);
  return Number.isNaN(analizada) ? ahora : new Date(analizada);
};

/** `openGateType` del equipo → quién abrió, en lenguaje del dominio. */
const quienAbrioDe = (crudo: string | null): QuienAbrio | null => {
  if (crudo === null || crudo === '') return null;
  const valor = crudo.toLowerCase();
  if (valor === 'white') return 'lista';
  if (valor === 'manual') return 'manual';
  if (valor === 'abnormal') return 'anomalo';
  // Un valor que el fabricante no documenta NO se traduce a «manual»: eso
  // afirmaría que abrimos nosotros sin saberlo. Se trata como anómalo.
  return 'anomalo';
};

const entero = (crudo: string | null): number | null => {
  if (crudo === null || crudo.trim() === '') return null;
  const n = Number(crudo);
  return Number.isFinite(n) ? n : null;
};

const recuadroDe = (xml: string): RecuadroDetectado | null => {
  const x = entero(etiqueta(xml, 'X'));
  const y = entero(etiqueta(xml, 'Y'));
  const ancho = entero(etiqueta(xml, 'width'));
  const alto = entero(etiqueta(xml, 'height'));
  if (x === null || y === null || ancho === null || alto === null) return null;
  return { x, y, ancho, alto };
};

/**
 * XML del Alarm Server → evento normalizado.
 *
 * **`enVivo` sale de `alarmDataType`, y ya no es siempre `true`.** Lo era por
 * un razonamiento que la documentación del fabricante desmiente: «la cámara
 * sólo POSTea cuando ocurre algo». El equipo también reenvía su historial por
 * este mismo canal, marcándolo con `alarmDataType: 1`, y sin filtrarlo la
 * portería mostraría accesos de hace días como si ocurrieran ahora.
 *
 * Lo que no cambia: el registro del equipo **no es fuente de verdad**. Él mismo
 * declara `isSupportLPAuditDataDelete: true` —su histórico se puede borrar por
 * API—, así que la trazabilidad vive en `eventos` y no en el aparato.
 */
export const desdeAlarmServerXml = (
  cuerpo: string,
  dispositivoId: string,
  ahora: Date,
): EventoDeEquipo | null => {
  if (!esXmlDeAlarmServer(cuerpo)) return null;

  const tipo = etiqueta(cuerpo, 'eventType');
  const placa = etiqueta(cuerpo, 'licensePlate') ?? etiqueta(cuerpo, 'plateNumber');
  const cuando = etiqueta(cuerpo, 'dateTime');
  const confianza = confianzaDelEvento(
    etiqueta(cuerpo, 'confidenceLevel'),
    etiqueta(cuerpo, 'confidence'),
  );

  /**
   * `noPlate` es lo que el equipo emite cuando **no hubo lectura**, y no es una
   * placa: tratarlo como tal produciría un vehículo llamado «noPlate» en el
   * padrón y un evento que afirma una lectura que no existió.
   */
  const placaLegible = placa === null || placa === '' || /^noplate$/i.test(placa) ? null : placa;

  return {
    clase: /ANPR|vehicle|LPR/i.test(tipo ?? '') ? 'placa' : 'desconocido',
    placa: placaLegible,
    confianza: confianza === null || Number.isNaN(confianza) ? null : confianza,
    quienAbrio: quienAbrioDe(etiqueta(cuerpo, 'openGateType')),
    tipoDePlaca: etiqueta(cuerpo, 'plateType'),
    colorDePlaca: etiqueta(cuerpo, 'plateColor'),
    pais: entero(etiqueta(cuerpo, 'country')),
    carril: entero(etiqueta(cuerpo, 'line')),
    sentido: etiqueta(cuerpo, 'direction'),
    tipoDeVehiculo: etiqueta(cuerpo, 'vehicleType'),
    tipoDeDeteccion: etiqueta(cuerpo, 'detectType'),
    placaEstandar: (() => {
      const v = etiqueta(cuerpo, 'plateStandardStatus');
      return v === null || v === '' ? null : /^(true|1|standard)$/i.test(v);
    })(),
    recuadro: recuadroDe(cuerpo),
    dispositivoId,
    // Un `dateTime` ilegible NO se descarta ni se inventa: se usa la hora de
    // recepción y el evento sigue su camino. Perder un acceso porque el reloj
    // del equipo emite un formato raro sería peor que registrarlo con la hora
    // en que llegó — y `eventos` guarda las dos (`ocurrido_en`, `registrado_en`).
    // Y una marca SIN desplazamiento tampoco se interpreta: ver arriba.
    ocurridoEn: fechaDelEquipo(cuando, ahora),
    horaSinDesplazamiento: cuando !== null && cuando !== '' && !traeDesplazamiento(cuando),
    enVivo: esDatoEnVivo(etiqueta(cuerpo, 'alarmDataType')),
    referenciaDelEquipo: etiqueta(cuerpo, 'eventId') ?? etiqueta(cuerpo, 'serialNumber'),
    personaId: null,
    esperaVeredicto: false,
    serieDelEquipo: null,
    esResultadoDeVerificacion: false,
    origenDeLlamada: null,
  };
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 6.7a · EL MISMO EVENTO, EN JSON · DOCUMENTADO, NO VERIFICADO
 *
 * El receptor del equipo admite `parameterFormatType` XML o JSON (la 15-C
 * dejó el equipo en XML a propósito). Si un firmware o una configuración
 * publica en JSON, la parte del evento llega como `application/json` y este
 * normalizador produce EXACTAMENTE el mismo `EventoDeEquipo` que el XML: el
 * resto del sistema no sabe en qué idioma habló la cámara.
 *
 * La forma JSON del evento ANPR es la del bloque de `alertStream` (mismas
 * claves), y se normaliza por el mismo sitio. `alarmDataType` se busca en la
 * raíz y dentro de `ANPR`; si no está, HISTÓRICO, como en XML.
 */
export const esJsonDeAlarmServer = (cuerpo: string): boolean =>
  /^\s*\{/.test(cuerpo) && /"eventType"/.test(cuerpo);

export const desdeAlarmServerJson = (
  cuerpo: string,
  dispositivoId: string,
  ahora: Date,
): EventoDeEquipo | null => {
  let objeto: unknown;
  try {
    objeto = JSON.parse(cuerpo);
  } catch {
    return null;
  }
  if (typeof objeto !== 'object' || objeto === null) return null;
  const raiz = objeto as Record<string, unknown>;
  const bloque = (raiz['EventNotificationAlert'] ?? raiz) as BloqueDeAlertStream &
    Record<string, unknown>;
  const anpr = (bloque.ANPR ?? {}) as Record<string, unknown>;
  const alarmDataType = bloque['alarmDataType'] ?? anpr['alarmDataType'];
  const base = desdeAlertStreamJson(bloque, dispositivoId, ahora);
  return {
    ...base,
    // En el sobre del receptor manda `alarmDataType`, no `currentEvent`.
    enVivo: esDatoEnVivo(alarmDataType === undefined ? null : String(alarmDataType)),
    referenciaDelEquipo:
      typeof bloque['eventId'] === 'string'
        ? bloque['eventId']
        : typeof bloque['serialNumber'] === 'string'
          ? bloque['serialNumber']
          : base.referenciaDelEquipo,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2 · VIDEOPORTERO · JSON del alertStream que ABRE nuestro sistema
// ─────────────────────────────────────────────────────────────────────────────

/** Forma mínima del bloque JSON del `alertStream` · DOCUMENTADA, NO VERIFICADA. */
export interface BloqueDeAlertStream {
  readonly eventType?: string;
  readonly eventState?: string;
  readonly dateTime?: string;
  readonly currentEvent?: boolean;
  readonly channelID?: number | string;
  readonly eventDescription?: string;
  readonly ANPR?: { readonly licensePlate?: string; readonly confidenceLevel?: number };
  /**
   * Evento de control de acceso de la TERMINAL (6.5). `employeeNoString` es el
   * identificador de persona que se dio de alta (= plantillaId); `remoteCheck`
   * dice si la terminal ESPERA el veredicto de la plataforma. Claves
   * [SUPUESTO] S-36 hasta capturarlas del equipo.
   */
  readonly AccessControllerEvent?: {
    readonly employeeNoString?: string;
    readonly employeeNo?: string | number;
    readonly remoteCheck?: boolean;
    /** A2 · el resultado de una verificación ya contestada: informativo. */
    readonly remoteCheckResult?: boolean | string | number;
    /** A2 · identifica la petición pendiente; se devuelve con el veredicto. */
    readonly serialNo?: number | string;
    readonly majorEventType?: number;
    readonly subEventType?: number;
    readonly verifyNo?: number;
  };
  /**
   * Llamada del VIDEOPORTERO (6.5). Origen tal como el equipo lo declara:
   * periodo/edificio/unidad. Claves [SUPUESTO] S-36.
   */
  readonly CallInfo?: {
    readonly periodNumber?: number | string;
    readonly buildingNumber?: number | string;
    readonly unitNumber?: number | string;
    readonly floorNumber?: number | string;
    readonly roomNumber?: number | string;
  };
  readonly voiceTalkEvent?: { readonly src?: BloqueDeAlertStream['CallInfo'] };
}

/** «edificio 1 · unidad 2 · periodo 3», con lo que venga. */
const origenDeLlamadaDe = (bloque: BloqueDeAlertStream): string | null => {
  const origen = bloque.CallInfo ?? bloque.voiceTalkEvent?.src;
  if (origen === undefined) return null;
  const partes = [
    ['periodo', origen.periodNumber],
    ['edificio', origen.buildingNumber],
    ['unidad', origen.unitNumber],
    ['piso', origen.floorNumber],
    ['apto', origen.roomNumber],
  ]
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .map(([k, v]) => `${String(k)} ${String(v)}`);
  return partes.length === 0 ? null : partes.join(' · ');
};

/** La clase de un bloque JSON, por lo que TRAE y no sólo por su tipo. */
export const claseDeBloque = (bloque: BloqueDeAlertStream): ClaseDeEvento => {
  const tipo = bloque.eventType ?? '';
  if ((bloque.ANPR?.licensePlate ?? null) !== null) return 'placa';
  if (bloque.AccessControllerEvent !== undefined || /AccessController/i.test(tipo)) return 'rostro';
  if (
    bloque.CallInfo !== undefined ||
    bloque.voiceTalkEvent !== undefined ||
    /videoIntercom|callSignal|voiceTalk/i.test(tipo)
  ) {
    return 'llamada';
  }
  if (/doorbell/i.test(tipo)) return 'timbre';
  return 'desconocido';
};

/**
 * **La línea que impide inundar el sistema al conectar.**
 *
 * Un bloque sin `currentEvent` se trata como **histórico**, no como en vivo. Es
 * deliberado y es la dirección segura: si un firmware omitiera el campo, el
 * coste de tratarlo como historial es que un timbre no suene; el coste
 * contrario es escribir eventos falsos en una tabla que no admite borrado
 * (ADR-05) y avisar a residentes de visitas de hace semanas.
 */
export const esEventoEnVivo = (bloque: BloqueDeAlertStream): boolean =>
  bloque.currentEvent === true;

export const desdeAlertStreamJson = (
  bloque: BloqueDeAlertStream,
  dispositivoId: string,
  ahora: Date,
): EventoDeEquipo => {
  const placa = bloque.ANPR?.licensePlate ?? null;
  const confianza = bloque.ANPR?.confidenceLevel ?? null;
  const cuando = bloque.dateTime;

  const acceso = bloque.AccessControllerEvent;
  const personaId =
    acceso?.employeeNoString ??
    (acceso?.employeeNo === undefined ? null : String(acceso.employeeNo));
  const serie =
    acceso?.serialNo === undefined || acceso.serialNo === null ? null : Number(acceso.serialNo);
  // Un RESULTADO no es una petición: aunque traiga `remoteCheck`, no se
  // espera veredicto de él. Lo detecta el campo o el tipo del evento.
  const esResultado =
    acceso?.remoteCheckResult !== undefined || /remoteCheckResult/i.test(bloque.eventType ?? '');

  return {
    clase: claseDeBloque(bloque),
    placa,
    // Mismo campo documentado y misma escala que en el sobre del Alarm Server:
    // porcentaje entero. Se normaliza por el mismo sitio para que no haya dos
    // interpretaciones de la misma cifra según por dónde entre el evento.
    confianza: confianzaDelEvento(confianza === null ? null : String(confianza), null),
    /**
     * El videoportero no emite ninguno de los campos del evento ANPR: son de
     * la cámara. Se rellenan a `null` EXPLÍCITAMENTE y no por omisión, para
     * que el día que un firmware empiece a emitirlos el compilador obligue a
     * decidir qué hacer con ellos en vez de tirarlos en silencio.
     */
    quienAbrio: null,
    tipoDePlaca: null,
    colorDePlaca: null,
    pais: null,
    carril: null,
    sentido: null,
    tipoDeVehiculo: null,
    tipoDeDeteccion: null,
    placaEstandar: null,
    recuadro: null,
    dispositivoId,
    ocurridoEn: fechaDelEquipo(cuando ?? null, ahora),
    horaSinDesplazamiento: cuando !== undefined && cuando !== '' && !traeDesplazamiento(cuando),
    enVivo: esEventoEnVivo(bloque),
    referenciaDelEquipo:
      bloque.channelID === undefined ? null : `${dispositivoId}:${bloque.channelID}`,
    personaId: personaId === null || personaId === '' ? null : personaId,
    esperaVeredicto: acceso?.remoteCheck === true && !esResultado,
    serieDelEquipo: serie === null || Number.isNaN(serie) ? null : serie,
    esResultadoDeVerificacion: esResultado,
    origenDeLlamada: origenDeLlamadaDe(bloque),
  };
};

/**
 * Filtra un volcado de `alertStream` dejando solo lo que ocurre AHORA.
 *
 * Se expone aparte del analizador porque el adaptador de la ETAPA 15 tiene que
 * poder contar cuántos históricos descartó: ese número, en el registro del
 * arranque, es lo que permite distinguir «el videoportero está mudo» de «el
 * videoportero volcó 412 eventos viejos y los descartamos todos».
 */
export const soloEnVivo = (
  bloques: readonly BloqueDeAlertStream[],
): { readonly enVivo: readonly BloqueDeAlertStream[]; readonly descartados: number } => {
  const enVivo = bloques.filter(esEventoEnVivo);
  return { enVivo, descartados: bloques.length - enVivo.length };
};

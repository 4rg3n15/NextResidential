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

/** Evento normalizado: lo único que sale de este módulo hacia el resto. */
export interface EventoDeEquipo {
  readonly clase: 'placa' | 'timbre' | 'desconocido';
  readonly placa: string | null;
  readonly confianza: number | null;
  readonly dispositivoId: string;
  readonly ocurridoEn: Date;
  /** `false` para lo que el equipo vuelca al conectar: historial, no presente. */
  readonly enVivo: boolean;
  /** Identificador del equipo tal como lo emite, para la clave de idempotencia. */
  readonly referenciaDelEquipo: string | null;
}

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
 * XML del Alarm Server → evento normalizado.
 *
 * `enVivo` es SIEMPRE `true` aquí, y eso es una diferencia real y no una
 * simplificación: la cámara solo POSTea cuando ocurre algo. El historial de la
 * cámara se consulta por otra ruta y **no es fuente de verdad**: el propio
 * equipo declara `isSupportLPAuditDataDelete: true`, es decir, su registro se
 * puede borrar por API (validación en sitio, §0.ter).
 */
export const desdeAlarmServerXml = (
  cuerpo: string,
  dispositivoId: string,
  ahora: Date,
): EventoDeEquipo | null => {
  if (!esXmlDeAlarmServer(cuerpo)) return null;

  const tipo = etiqueta(cuerpo, 'eventType');
  const placa = etiqueta(cuerpo, 'licensePlate') ?? etiqueta(cuerpo, 'plateNumber');
  const confianzaCruda = etiqueta(cuerpo, 'confidenceLevel') ?? etiqueta(cuerpo, 'confidence');
  const cuando = etiqueta(cuerpo, 'dateTime');

  // La confianza llega en porcentaje entero (0-100) en unos firmware y en
  // fracción en otros. Se normaliza a 0..1, que es lo que el dominio compara
  // contra el umbral configurable. Dividir siempre —o nunca— produce un umbral
  // que solo funciona con la mitad de los equipos.
  const confianza =
    confianzaCruda === null || confianzaCruda === ''
      ? null
      : Number(confianzaCruda) > 1
        ? Number(confianzaCruda) / 100
        : Number(confianzaCruda);

  return {
    clase: /ANPR|vehicle|LPR/i.test(tipo ?? '') ? 'placa' : 'desconocido',
    placa: placa === null || placa === '' ? null : placa,
    confianza: confianza === null || Number.isNaN(confianza) ? null : confianza,
    dispositivoId,
    // Un `dateTime` ilegible NO se descarta ni se inventa: se usa la hora de
    // recepción y el evento sigue su camino. Perder un acceso porque el reloj
    // del equipo emite un formato raro sería peor que registrarlo con la hora
    // en que llegó — y `eventos` guarda las dos (`ocurrido_en`, `registrado_en`).
    ocurridoEn: cuando !== null && !Number.isNaN(Date.parse(cuando)) ? new Date(cuando) : ahora,
    enVivo: true,
    referenciaDelEquipo: etiqueta(cuerpo, 'eventId') ?? etiqueta(cuerpo, 'serialNumber'),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 2 · VIDEOPORTERO · JSON del alertStream que ABRE nuestro sistema
// ─────────────────────────────────────────────────────────────────────────────

/** Forma mínima del bloque JSON del `alertStream`. */
export interface BloqueDeAlertStream {
  readonly eventType?: string;
  readonly eventState?: string;
  readonly dateTime?: string;
  readonly currentEvent?: boolean;
  readonly channelID?: number | string;
  readonly eventDescription?: string;
  readonly ANPR?: { readonly licensePlate?: string; readonly confidenceLevel?: number };
}

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
  const tipo = bloque.eventType ?? '';
  const placa = bloque.ANPR?.licensePlate ?? null;
  const confianza = bloque.ANPR?.confidenceLevel ?? null;
  const cuando = bloque.dateTime;

  return {
    clase:
      placa !== null
        ? 'placa'
        : /doorbell|callSignal|videoIntercom/i.test(tipo)
          ? 'timbre'
          : 'desconocido',
    placa,
    confianza: confianza === null ? null : confianza > 1 ? confianza / 100 : confianza,
    dispositivoId,
    ocurridoEn:
      cuando !== undefined && !Number.isNaN(Date.parse(cuando)) ? new Date(cuando) : ahora,
    enVivo: esEventoEnVivo(bloque),
    referenciaDelEquipo:
      bloque.channelID === undefined ? null : `${dispositivoId}:${bloque.channelID}`,
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

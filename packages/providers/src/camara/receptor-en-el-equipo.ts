import { bloques, entero, escapar, etiqueta, opciones } from '../equipo/xml';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * APUNTAR EL EQUIPO A NUESTRO RECEPTOR · tres decisiones que no son cosméticas
 *
 * El equipo publica sus eventos donde le digan, y **cómo** los publica también
 * se configura aquí. Tres campos del mismo documento deciden si el receptor los
 * entiende, con qué acreditación llegan, y **si viajan rostros**.
 *
 * ── 1 · El formato: XML, no JSON ─────────────────────────────────────────────
 * Nuestro analizador lee el XML del evento. Con el equipo en JSON, el receptor
 * recibe algo que no sabe abrir y el síntoma es «sobre ilegible» en bucle: el
 * equipo reenvía porque nunca da la notificación por entregada, y el registro
 * se llena de rechazos que parecen un problema de red.
 *
 * ── 2 · La acreditación: la cámara SÍ puede firmarse ─────────────────────────
 * El receptor documenta que «la cámara no firma», y eso es cierto de una firma
 * sobre el cuerpo. **No es cierto que llegue anónima**: el equipo admite
 * autenticación de tipo resumen contra nuestro extremo. Es una vía real de
 * endurecimiento y queda declarada en `H-15-1` con lo que costaría usarla —un
 * verificador en el receptor y una credencial por equipo—.
 *
 * **El secreto de la ruta NO se retira**: se suman, no se sustituyen. Quitarlo
 * a cambio de una acreditación que todavía no está implementada dejaría el
 * extremo más débil que antes.
 *
 * ── 3 · Las imágenes: minimizar en el ORIGEN, no descartar después ───────────
 * El mismo documento trae el interruptor que decide qué imágenes envía el
 * equipo. Con `all`, manda también los recortes de **rostro** del conductor y
 * del acompañante: dato biométrico entrando por un canal que no pasa por el
 * ciclo de consentimiento (RN-09, RN-10, Ley 1581).
 *
 * Hoy eso se descarta al recibir, y esa alerta (`H-16-1`) **se mantiene**: es
 * la red de seguridad si alguien lo cambia en el equipo. Pero la ley pide
 * **minimización**, no descarte posterior: el dato que no viaja no se puede
 * filtrar, ni quedar en un registro intermedio, ni aparecer en una captura de
 * red. Por eso el alta de una cámara propone la opción que no envía rostros y
 * dice en pantalla por qué.
 */

/** Lo que el equipo puede enviar. `all` incluye los recortes de ROSTRO. */
export const IMAGENES = {
  todo: 'all',
  soloPlaca: 'licensePlatePicture',
  soloDeteccion: 'detectionPicture',
  ninguna: 'notUpload',
} as const;
export type ImagenesDelEvento = (typeof IMAGENES)[keyof typeof IMAGENES];

/** Las dos únicas admisibles para una cámara de este proyecto. */
export const IMAGENES_SIN_ROSTRO: readonly ImagenesDelEvento[] = [
  IMAGENES.soloDeteccion,
  IMAGENES.soloPlaca,
];

export const FORMATO_EXIGIDO = 'XML';
export const ACREDITACION_RESUMEN = 'MD5digest';

export interface ReceptorEnElEquipo {
  readonly id: number | null;
  readonly url: string | null;
  readonly protocolo: string | null;
  readonly formato: string | null;
  readonly formaDeDireccion: string | null;
  readonly host: string | null;
  readonly puerto: number | null;
  readonly acreditacion: string | null;
  readonly imagenes: string | null;
}

export const leerReceptores = (cuerpo: string): readonly ReceptorEnElEquipo[] =>
  bloques(cuerpo, 'HttpHostNotification').map((bloque) => ({
    id: entero(etiqueta(bloque, 'id')),
    url: etiqueta(bloque, 'url'),
    protocolo: etiqueta(bloque, 'protocolType'),
    formato: etiqueta(bloque, 'parameterFormatType'),
    formaDeDireccion: etiqueta(bloque, 'addressingFormatType'),
    host: etiqueta(bloque, 'hostName') ?? etiqueta(bloque, 'ipAddress'),
    puerto: entero(etiqueta(bloque, 'portNo')),
    acreditacion: etiqueta(bloque, 'httpAuthenticationMethod'),
    imagenes: etiqueta(bloque, 'detectionUpLoadPicturesType'),
  }));

export interface HallazgoDelReceptor {
  readonly campo: string;
  readonly valorLeido: string | null;
  readonly detalle: string;
  readonly valorCorrecto: string;
}

export interface VeredictoDelReceptor {
  readonly leido: boolean;
  readonly receptores: readonly ReceptorEnElEquipo[];
  /** Impiden que el evento llegue o que llegue legible. */
  readonly bloqueos: readonly HallazgoDelReceptor[];
  /** No impiden el evento, pero hacen viajar lo que no debe viajar. */
  readonly avisos: readonly HallazgoDelReceptor[];
  /** `true` si algún receptor está configurado para enviar rostros. */
  readonly enviaRostros: boolean;
  readonly detalle: string;
}

export const juzgarReceptor = (cuerpo: string): VeredictoDelReceptor => {
  const receptores = leerReceptores(cuerpo);
  const leido = /HttpHostNotification/i.test(cuerpo);
  const bloqueos: HallazgoDelReceptor[] = [];
  const avisos: HallazgoDelReceptor[] = [];

  for (const receptor of receptores) {
    const cual = `receptor ${String(receptor.id ?? '?')}`;
    if (receptor.formato !== null && receptor.formato.toUpperCase() !== FORMATO_EXIGIDO) {
      bloqueos.push({
        campo: `${cual} · formato de notificación`,
        valorLeido: receptor.formato,
        detalle:
          'El receptor de Next Control lee el XML del evento. Con el equipo en otro formato ' +
          'el sobre llega ilegible, el equipo nunca lo da por entregado y lo reenvía en ' +
          'bucle: el síntoma parece un problema de red y no lo es',
        valorCorrecto: FORMATO_EXIGIDO,
      });
    }
    if (receptor.imagenes !== null && receptor.imagenes.toLowerCase() === IMAGENES.todo) {
      avisos.push({
        campo: `${cual} · qué imágenes envía`,
        valorLeido: receptor.imagenes,
        detalle:
          'Con esta opción el equipo envía TAMBIÉN los recortes de rostro del conductor y del ' +
          'acompañante: dato biométrico por un canal que no pasa por el consentimiento del ' +
          'titular (RN-09, RN-10, Ley 1581). Se descartan al recibir, pero la ley pide ' +
          'minimizar en el origen: el dato que no viaja no se puede filtrar',
        valorCorrecto: IMAGENES.soloDeteccion,
      });
    }
  }

  const enviaRostros = receptores.some((r) => (r.imagenes ?? '').toLowerCase() === IMAGENES.todo);

  return {
    leido,
    receptores,
    bloqueos,
    avisos,
    enviaRostros,
    detalle: !leido
      ? 'El equipo no devolvió su configuración de notificación'
      : receptores.length === 0
        ? 'El equipo no tiene ningún receptor configurado: no publicará eventos en ninguna parte'
        : bloqueos.length === 0 && avisos.length === 0
          ? `${String(receptores.length)} receptor(es) configurado(s) correctamente`
          : `${String(bloqueos.length)} bloqueo(s) y ${String(avisos.length)} aviso(s)`,
  };
};

export interface DestinoDelReceptor {
  readonly id: number;
  readonly url: string;
  readonly host: string;
  readonly puerto: number;
  /** `true` cuando el host es un nombre y no una dirección. */
  readonly esNombre: boolean;
  readonly imagenes: ImagenesDelEvento;
  /** `true` para pedir al equipo que se acredite contra nuestro receptor. */
  readonly conAcreditacion: boolean;
  readonly seguro: boolean;
}

/**
 * Cuerpo del documento de notificación, con el esquema completo.
 *
 * Vive aquí y no en quien lo invoca por lo de siempre (KPI-11): los nombres de
 * elemento son vocabulario del fabricante, y quien configura un receptor no
 * tiene por qué saber cómo se llama el campo del formato.
 */
export const cuerpoDeReceptor = (destino: DestinoDelReceptor): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<HttpHostNotificationList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">',
    '<HttpHostNotification>',
    `<id>${String(destino.id)}</id>`,
    `<url>${escapar(destino.url)}</url>`,
    `<protocolType>${destino.seguro ? 'HTTPS' : 'HTTP'}</protocolType>`,
    `<parameterFormatType>${FORMATO_EXIGIDO}</parameterFormatType>`,
    `<addressingFormatType>${destino.esNombre ? 'hostname' : 'ipaddress'}</addressingFormatType>`,
    destino.esNombre
      ? `<hostName>${escapar(destino.host)}</hostName>`
      : `<ipAddress>${escapar(destino.host)}</ipAddress>`,
    `<portNo>${String(destino.puerto)}</portNo>`,
    `<httpAuthenticationMethod>${destino.conAcreditacion ? ACREDITACION_RESUMEN : 'none'}</httpAuthenticationMethod>`,
    '<ANPR>',
    `<detectionUpLoadPicturesType>${destino.imagenes}</detectionUpLoadPicturesType>`,
    '</ANPR>',
    '</HttpHostNotification>',
    '</HttpHostNotificationList>',
  ].join('');

/**
 * Qué admite ESTE equipo, leído de sus capacidades. Se consulta antes de
 * escribir: proponer en pantalla una opción que el equipo no soporta produce un
 * rechazo que el operador no puede interpretar.
 */
export const imagenesAdmitidas = (capacidades: string): readonly string[] =>
  opciones(capacidades, 'detectionUpLoadPicturesType');

import { bloques, booleano, entero, etiqueta } from '../equipo/xml';
import type { BloqueDeAlertStream } from './contratos-de-evento';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UNA PARTE XML DEL FLUJO → el mismo bloque que la parte JSON · H-SITIO-14, R3
 *
 * La guía dice que el enlace de armado lleva `<SubscribeEventResponse/>` primero
 * y `<EventNotificationAlert/>` (el evento o el latido) después, y la
 * suscripción de la API pide XML. Hasta la 15-L esto leía sólo `currentEvent`,
 * `channelID`, la persona y la hora: **la pregunta de la terminal se perdía**.
 * Sin `remoteCheck` el rostro no esperaba veredicto; sin `serialNo` no había a
 * qué petición contestar. La terminal esperaba su plazo y negaba.
 *
 * Ahora se leen los campos que el resto del sistema usa, con los nombres de la
 * guía y en el bloque donde la guía los pone: los del control de acceso dentro
 * de `<AccessControllerEvent>`, los de la llamada dentro de `<VoiceTalkEvent>`.
 * Lo demás no se inventa. DOCUMENTADO, NO VERIFICADO en estos modelos.
 */

const texto = (xml: string, nombre: string): string | undefined =>
  etiqueta(xml, nombre) ?? undefined;

const numeroOTexto = (xml: string, nombre: string): number | string | undefined => {
  const crudo = etiqueta(xml, nombre);
  if (crudo === null || crudo === '') return undefined;
  return entero(crudo) ?? crudo;
};

/** Sólo las claves que vienen: un `undefined` explícito rompe `exactOptionalPropertyTypes`. */
type SinIndefinidos<T> = { [K in keyof T]?: Exclude<T[K], undefined> };
const conValor = <T extends object>(objeto: T): SinIndefinidos<T> =>
  Object.fromEntries(
    Object.entries(objeto).filter(([, v]) => v !== undefined),
  ) as SinIndefinidos<T>;

const accesoDesdeXml = (
  xml: string,
  tipo: string | undefined,
): BloqueDeAlertStream['AccessControllerEvent'] | undefined => {
  const interior = bloques(xml, 'AccessControllerEvent')[0];
  if (interior === undefined && !/AccessController/i.test(tipo ?? '')) return undefined;
  const donde = interior ?? xml;
  const actual =
    booleano(etiqueta(donde, 'currentEvent')) ?? booleano(etiqueta(xml, 'currentEvent'));
  const pregunta = booleano(etiqueta(donde, 'remoteCheck'));
  const resultado = etiqueta(donde, 'remoteCheckResult');
  const mayor = entero(etiqueta(donde, 'majorEventType'));
  const menor = entero(etiqueta(donde, 'subEventType'));
  const verificacion = entero(etiqueta(donde, 'verifyNo'));
  return conValor({
    employeeNoString: texto(donde, 'employeeNoString') ?? texto(donde, 'employeeNo'),
    currentEvent: actual ?? undefined,
    remoteCheck: pregunta ?? undefined,
    remoteCheckResult: resultado ?? undefined,
    serialNo: numeroOTexto(donde, 'serialNo'),
    majorEventType: mayor ?? undefined,
    subEventType: menor ?? undefined,
    verifyNo: verificacion ?? undefined,
    time: texto(donde, 'time'),
  });
};

const llamadaDesdeXml = (xml: string): BloqueDeAlertStream['VoiceTalkEvent'] | undefined => {
  const interior = bloques(xml, 'VoiceTalkEvent')[0];
  if (interior === undefined) return undefined;
  const origen = bloques(interior, 'src')[0];
  const actual = booleano(etiqueta(interior, 'currentEvent'));
  return conValor({
    cmdType: texto(interior, 'cmdType'),
    serialNo: numeroOTexto(interior, 'serialNo'),
    currentEvent: actual ?? undefined,
    src:
      origen === undefined
        ? undefined
        : conValor({
            periodNumber: numeroOTexto(origen, 'periodNumber'),
            buildingNumber: numeroOTexto(origen, 'buildingNumber'),
            unitNumber: numeroOTexto(origen, 'unitNumber'),
            floorNumber: numeroOTexto(origen, 'floorNumber'),
            roomNumber: numeroOTexto(origen, 'roomNumber'),
          }),
  });
};

export const bloqueDesdeXml = (
  xml: string,
): BloqueDeAlertStream | 'respuesta_de_suscripcion' | null => {
  if (/<(?:\w+:)?SubscribeEventResponse\b/i.test(xml)) return 'respuesta_de_suscripcion';
  if (!/<(?:\w+:)?EventNotificationAlert\b/i.test(xml)) return null;
  const tipo = texto(xml, 'eventType');
  // `currentEvent` en la RAÍZ sólo si está fuera de los bloques anidados: si
  // no, el de dentro se leería dos veces y se daría por declarado en la raíz.
  const raiz = xml
    .replace(/<(?:\w+:)?AccessControllerEvent\b[\s\S]*?<\/(?:\w+:)?AccessControllerEvent>/gi, '')
    .replace(/<(?:\w+:)?VoiceTalkEvent\b[\s\S]*?<\/(?:\w+:)?VoiceTalkEvent>/gi, '');
  const actual = booleano(etiqueta(raiz, 'currentEvent'));
  return conValor({
    eventType: tipo,
    eventState: texto(xml, 'eventState'),
    dateTime: texto(raiz, 'dateTime'),
    currentEvent: actual ?? undefined,
    channelID: numeroOTexto(raiz, 'channelID'),
    uid: texto(raiz, 'uid'),
    AccessControllerEvent: accesoDesdeXml(xml, tipo),
    VoiceTalkEvent: llamadaDesdeXml(xml),
  });
};

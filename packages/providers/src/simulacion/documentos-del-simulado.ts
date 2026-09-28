import type { GuionDeEquipo } from './equipo-simulado';

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
export const ESPACIO = 'http://www.isapi.org/ver20/XMLSchema';

export const entranceParam = (guion: GuionDeEquipo): string =>
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

export const disparador = (guion: GuionDeEquipo): string =>
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

export const datosBasicos = (guion: GuionDeEquipo): string =>
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

export const CAPACIDADES_DE_CANAL = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  `<BasicInfoCap version="2.0" xmlns="${ESPACIO}">`,
  '<channelID opt="1"/>',
  '<region opt="default,EU,CIS,EU_CIS,ME"/>',
  '<CRIndex opt="0,210,253,254"/>',
  '</BasicInfoCap>',
].join('');

/**
 * C2 (15-L) · el receptor de la cámara, CON ESTADO: lo que se escribe por
 * «apuntar el equipo a nuestro receptor» (o por identificador) es lo que la
 * siguiente lectura devuelve. Así el ensayo puede comparar a dónde publica con
 * la IP del Mac, y la corrección «Enviar eventos a este Mac» ejercerse contra
 * el simulado y no contra un `fetch` escrito a medida.
 */
export interface ReceptorSimulado {
  readonly url: string;
  readonly ip: string | null;
  readonly nombre: string | null;
  readonly puerto: number;
  readonly formato: string;
  readonly imagenes: string;
}

export const receptorInicial = (guion: GuionDeEquipo): ReceptorSimulado => ({
  url: guion.receptor?.url ?? '/alarm-server',
  ip: guion.receptor?.nombre === undefined ? (guion.receptor?.ip ?? '198.51.100.10') : null,
  nombre: guion.receptor?.nombre ?? null,
  puerto: guion.receptor?.puerto ?? 3000,
  formato: guion.formatoDeNotificacion ?? 'XML',
  imagenes: guion.imagenesDelEvento ?? 'detectionPicture',
});

const campo = (xml: string, nombre: string): string | undefined =>
  new RegExp(`<${nombre}>\\s*([^<]*?)\\s*</${nombre}>`).exec(xml)?.[1];

/** Lo escrito sobre lo que había: un campo que no viene no se toca. `null` si no es un receptor. */
export const receptorEscrito = (
  actual: ReceptorSimulado,
  cuerpo: string,
): ReceptorSimulado | null => {
  if (!/<HttpHostNotification\b/.test(cuerpo)) return null;
  const forma = campo(cuerpo, 'addressingFormatType');
  const ip = campo(cuerpo, 'ipAddress');
  const nombre = campo(cuerpo, 'hostName');
  const puerto = Number(campo(cuerpo, 'portNo') ?? actual.puerto);
  const porNombre = forma === 'hostname' || (forma === undefined && nombre !== undefined);
  return {
    url: campo(cuerpo, 'url') ?? actual.url,
    ip: porNombre ? null : (ip ?? actual.ip),
    nombre: porNombre ? (nombre ?? actual.nombre) : null,
    puerto: Number.isInteger(puerto) ? puerto : actual.puerto,
    formato: campo(cuerpo, 'parameterFormatType') ?? actual.formato,
    imagenes: campo(cuerpo, 'detectionUpLoadPicturesType') ?? actual.imagenes,
  };
};

export const documentoDelReceptor = (r: ReceptorSimulado): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<HttpHostNotificationList version="2.0" xmlns="${ESPACIO}">`,
    '<HttpHostNotification>',
    '<id>1</id>',
    `<url>${r.url}</url>`,
    '<protocolType>HTTP</protocolType>',
    `<parameterFormatType>${r.formato}</parameterFormatType>`,
    `<addressingFormatType>${r.nombre === null ? 'ipaddress' : 'hostname'}</addressingFormatType>`,
    r.nombre === null ? `<ipAddress>${r.ip ?? ''}</ipAddress>` : `<hostName>${r.nombre}</hostName>`,
    `<portNo>${String(r.puerto)}</portNo>`,
    '<httpAuthenticationMethod>none</httpAuthenticationMethod>',
    '<ANPR>',
    `<detectionUpLoadPicturesType>${r.imagenes}</detectionUpLoadPicturesType>`,
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
export const capacidadesDelSistema = (guion: GuionDeEquipo): string => {
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
export const CANALES_POR_OMISION = [{ id: 1, habilitado: true, codec: 'G.711ulaw' }] as const;

export type CanalDeAudioSimulado = NonNullable<GuionDeEquipo['canalesDeAudio']>[number];

export const canalesDeAudio = (canales: readonly CanalDeAudioSimulado[]): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<TwoWayAudioChannelList version="2.0" xmlns="${ESPACIO}">`,
    ...canales.map(
      (c) =>
        `<TwoWayAudioChannel><id>${String(c.id)}</id><enabled>${c.habilitado ? 'true' : 'false'}</enabled>` +
        `<audioCompressionType>${c.codec ?? 'G.711ulaw'}</audioCompressionType>` +
        '<audioInputType>MicIn</audioInputType><speakerVolume>50</speakerVolume>' +
        '<noisereduce>false</noisereduce></TwoWayAudioChannel>',
    ),
    '</TwoWayAudioChannelList>',
  ].join('');

export const ordenesDePuerta = (guion: GuionDeEquipo): string =>
  '<?xml version="1.0" encoding="UTF-8"?>' +
  `<RemoteControlDoorCap version="2.0" xmlns="${ESPACIO}">` +
  `<cmd opt="${(guion.ordenesDePuerta ?? ['open', 'close']).join(',')}"/>` +
  '</RemoteControlDoorCap>';

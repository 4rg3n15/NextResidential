import { describe, expect, it } from 'vitest';
import { leerDisparador } from './disparadores-vinculados';
import {
  PAIS_COLOMBIA,
  camposObligatoriosQueFaltan,
  conPaisCorregido,
  juzgarPais,
  leerDatosBasicos,
} from './pais-del-algoritmo';
import {
  IMAGENES,
  cuerpoDeReceptor,
  imagenesAdmitidas,
  juzgarReceptor,
} from './receptor-en-el-equipo';
import { juzgarCapacidadesAnpr } from './capacidades-anpr';

const ESPACIO = 'http://www.isapi.org/ver20/XMLSchema';

// ─────────────────────────────────────────────────────────────────────────────
// LA TERCERA VÍA
// ─────────────────────────────────────────────────────────────────────────────

const disparador = (conSalida: boolean): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<EventTrigger version="2.0" xmlns="${ESPACIO}">`,
    '<id>vehicledetection-1</id>',
    '<eventType>vehicledetection</eventType>',
    '<EventTriggerNotificationList>',
    '<EventTriggerNotification><id>1</id>',
    '<notificationMethod>center</notificationMethod></EventTriggerNotification>',
    ...(conSalida
      ? [
          '<EventTriggerNotification><id>2</id>',
          '<notificationMethod>IO</notificationMethod>',
          '<outputIOPortID>1</outputIOPortID></EventTriggerNotification>',
        ]
      : []),
    '</EventTriggerNotificationList>',
    '</EventTrigger>',
  ].join('');

describe('disparadores vinculados · la vía que ninguna comprobación anterior veía', () => {
  it('un disparador que sólo notifica al centro no abre nada', () => {
    const veredicto = leerDisparador(disparador(false));
    expect(veredicto.leido).toBe(true);
    expect(veredicto.abrePorSuCuenta).toBe(false);
  });

  it('una acción de E/S acciona una salida FÍSICA y se detecta', () => {
    // Si ese puerto es el relé de la barrera, el brazo sube al detectar un
    // vehículo, valga lo que valga el modo de control.
    const veredicto = leerDisparador(disparador(true));
    expect(veredicto.abrePorSuCuenta).toBe(true);
  });

  it('y el hallazgo dice el NÚMERO de puerto, no sólo que lo hay', () => {
    // Sin él, «hay una acción de E/S» manda a recorrer una pantalla entera.
    expect(leerDisparador(disparador(true)).detalle).toContain('1');
  });

  it('una respuesta vacía no se lee como «no abre»', () => {
    const veredicto = leerDisparador('');
    expect(veredicto.leido).toBe(false);
    expect(veredicto.detalle).toMatch(/no se puede descartar/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL PAÍS DEL ALGORITMO
// ─────────────────────────────────────────────────────────────────────────────

const basicos = (indice: string, extra = ''): string =>
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
    `<CRIndex>${indice}</CRIndex>`,
    extra,
    '</BasicInfo>',
  ].join('');

const CAPACIDADES_DE_CANAL =
  `<BasicInfoCap version="2.0" xmlns="${ESPACIO}">` +
  '<region opt="default,EU,CIS,EU_CIS,ME"/><CRIndex opt="0,210,253,254"/></BasicInfoCap>';

describe('el país del algoritmo · lo que decide si la cámara LEE BIEN', () => {
  it('210 es Colombia y es lo correcto', () => {
    const veredicto = juzgarPais(leerDatosBasicos(basicos('210')), CAPACIDADES_DE_CANAL);
    expect(veredicto.clase).toBe('correcto');
    expect(PAIS_COLOMBIA).toBe(210);
  });

  it('el genérico NO da error: acierta poco, y el síntoma parece de enfoque', () => {
    const veredicto = juzgarPais(leerDatosBasicos(basicos('0')), CAPACIDADES_DE_CANAL);
    expect(veredicto.clase).toBe('generico');
    expect(veredicto.detalle).toMatch(/no dará error/i);
  });

  it('«inválido» y «no reconocido» tampoco son países', () => {
    expect(juzgarPais(leerDatosBasicos(basicos('253')), CAPACIDADES_DE_CANAL).clase).toBe(
      'generico',
    );
    expect(juzgarPais(leerDatosBasicos(basicos('254')), CAPACIDADES_DE_CANAL).clase).toBe(
      'generico',
    );
  });

  it('si el equipo NO declara admitir 210, no se escribe', () => {
    const sin210 = `<BasicInfoCap xmlns="${ESPACIO}"><CRIndex opt="0,1,2"/></BasicInfoCap>`;
    const veredicto = juzgarPais(leerDatosBasicos(basicos('0')), sin210);
    expect(veredicto.corregible).toBe(false);
    expect(veredicto.detalle).toMatch(/NO declara admitirlo/i);
  });

  it('sin capacidades no se escribe A CIEGAS: no saber ≠ saber que no', () => {
    const veredicto = juzgarPais(leerDatosBasicos(basicos('7')), '');
    expect(veredicto.corregible).toBe(false);
    expect(veredicto.detalle).toMatch(/no declaró qué índices admite/i);
  });

  it('EL ÍNDICE MANDA sobre el país: sin índice y con país inválido, se REPORTA', () => {
    // El propio documento dice que ese caso necesita lógica adicional. Se dice
    // con esas palabras en vez de inventarla.
    const sinIndice = `<BasicInfo xmlns="${ESPACIO}"><channelID>1</channelID><countryIndex>253</countryIndex></BasicInfo>`;
    const veredicto = juzgarPais(leerDatosBasicos(sinIndice), CAPACIDADES_DE_CANAL);
    expect(veredicto.clase).toBe('sin_declarar');
    expect(veredicto.detalle).toMatch(/lógica adicional/i);
  });

  it('corregir conserva TODO lo demás del documento', () => {
    // El `PUT` exige el documento completo: escribir sólo el índice borraría la
    // identificación del punto de captura.
    const corregido = conPaisCorregido(basicos('0'));
    expect(corregido).toContain('<CRIndex>210</CRIndex>');
    expect(corregido).toContain('<monitoringSiteID>SITIO1</monitoringSiteID>');
    expect(corregido).toContain('<region>other</region>');
  });

  it('y si falta un campo obligatorio, se NOMBRA en vez de escribir a medias', () => {
    const incompleto = `<BasicInfo xmlns="${ESPACIO}"><CRIndex>0</CRIndex></BasicInfo>`;
    expect(camposObligatoriosQueFaltan(incompleto)).toContain('monitoringSiteID');
    expect(camposObligatoriosQueFaltan(basicos('210'))).toHaveLength(0);
  });

  it('la REGIÓN se devuelve tal cual vino: el capítulo la enumera de dos formas (C-17)', () => {
    expect(leerDatosBasicos(basicos('210')).region).toBe('other');
    expect(conPaisCorregido(basicos('210'))).toContain('<region>other</region>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EL RECEPTOR EN EL EQUIPO
// ─────────────────────────────────────────────────────────────────────────────

const receptor = (formato: string, imagenes: string): string =>
  [
    `<HttpHostNotificationList version="2.0" xmlns="${ESPACIO}">`,
    '<HttpHostNotification><id>1</id><url>/alarm-server</url>',
    '<protocolType>HTTP</protocolType>',
    `<parameterFormatType>${formato}</parameterFormatType>`,
    '<addressingFormatType>ipaddress</addressingFormatType>',
    '<ipAddress>198.51.100.10</ipAddress><portNo>3000</portNo>',
    '<httpAuthenticationMethod>none</httpAuthenticationMethod>',
    `<ANPR><detectionUpLoadPicturesType>${imagenes}</detectionUpLoadPicturesType></ANPR>`,
    '</HttpHostNotification></HttpHostNotificationList>',
  ].join('');

describe('el receptor en el equipo · tres campos que deciden si el evento llega', () => {
  it('XML y sin rostros es lo conforme', () => {
    const veredicto = juzgarReceptor(receptor('XML', IMAGENES.soloDeteccion));
    expect(veredicto.bloqueos).toHaveLength(0);
    expect(veredicto.avisos).toHaveLength(0);
  });

  it('JSON BLOQUEA: el sobre llegaría ilegible y el equipo reenviaría en bucle', () => {
    const veredicto = juzgarReceptor(receptor('JSON', IMAGENES.soloDeteccion));
    expect(veredicto.bloqueos[0]?.detalle).toMatch(/ilegible|bucle/i);
  });

  it('`all` envía ROSTROS y eso se avisa citando la minimización', () => {
    // La ley pide minimizar en el origen, no descartar después: el dato que no
    // viaja no se puede filtrar.
    const veredicto = juzgarReceptor(receptor('XML', IMAGENES.todo));
    expect(veredicto.enviaRostros).toBe(true);
    expect(veredicto.avisos[0]?.detalle).toMatch(/minimizar en el origen/i);
    expect(veredicto.avisos[0]?.valorCorrecto).toBe(IMAGENES.soloDeteccion);
  });

  it('un equipo SIN receptor configurado no publicará en ninguna parte, y se dice', () => {
    const veredicto = juzgarReceptor(`<HttpHostNotificationList xmlns="${ESPACIO}"/>`);
    expect(veredicto.detalle).toMatch(/no tiene ningún receptor/i);
  });

  it('el cuerpo que se escribe lleva el esquema completo y el formato exigido', () => {
    const cuerpo = cuerpoDeReceptor({
      id: 1,
      url: '/alarm-server/secreto',
      host: '198.51.100.10',
      puerto: 3000,
      esNombre: false,
      imagenes: IMAGENES.soloDeteccion,
      conAcreditacion: true,
      seguro: false,
    });
    expect(cuerpo).toContain('<parameterFormatType>XML</parameterFormatType>');
    expect(cuerpo).toContain('<ipAddress>198.51.100.10</ipAddress>');
    expect(cuerpo).toContain('<httpAuthenticationMethod>MD5digest</httpAuthenticationMethod>');
    expect(cuerpo).toContain('<detectionUpLoadPicturesType>detectionPicture');
  });

  it('con nombre de servidor usa el elemento de nombre, no el de dirección', () => {
    const cuerpo = cuerpoDeReceptor({
      id: 1,
      url: '/alarm-server',
      host: 'next.control.invalid',
      puerto: 443,
      esNombre: true,
      imagenes: IMAGENES.soloPlaca,
      conAcreditacion: false,
      seguro: true,
    });
    expect(cuerpo).toContain('<hostName>next.control.invalid</hostName>');
    expect(cuerpo).toContain('<protocolType>HTTPS</protocolType>');
    expect(cuerpo).toContain('<httpAuthenticationMethod>none</httpAuthenticationMethod>');
  });

  it('las opciones admitidas salen de las capacidades del propio equipo', () => {
    const capacidades =
      '<HttpHostNotificationCap><detectionUpLoadPicturesType ' +
      'opt="all,licensePlatePicture,detectionPicture,notUpload"/></HttpHostNotificationCap>';
    expect(imagenesAdmitidas(capacidades)).toContain('detectionPicture');
    expect(imagenesAdmitidas('')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LAS CUATRO CONSULTAS DE CAPACIDAD
// ─────────────────────────────────────────────────────────────────────────────

describe('las cuatro preguntas del §9.1.1 · basta con que se cumpla UNA', () => {
  it('con la del sistema basta', () => {
    const veredicto = juzgarCapacidadesAnpr({
      sistema:
        '<DeviceCap><ITCCap><isSupportVehicleDetection>true</isSupportVehicleDetection></ITCCap></DeviceCap>',
    });
    expect(veredicto.admite).toBe(true);
  });

  it('con la de tráfico, también', () => {
    expect(juzgarCapacidadesAnpr({ trafico: '<TrafficCap><plateCap/></TrafficCap>' }).admite).toBe(
      true,
    );
  });

  it('con la del modo de disparo, también', () => {
    expect(
      juzgarCapacidadesAnpr({
        modoDeDisparo: '<TriggerModeCap><TriggerMode opt="1,2"/></TriggerModeCap>',
      }).admite,
    ).toBe(true);
  });

  it('un `false` explícito NO cuenta como declaración', () => {
    const veredicto = juzgarCapacidadesAnpr({
      sistema:
        '<DeviceCap><ITCCap><isSupportVehicleDetection>false</isSupportVehicleDetection></ITCCap></DeviceCap>',
    });
    expect(veredicto.admite).toBe(false);
  });

  it('si NINGUNA contesta, el fabricante dice que no se siga, y se dice', () => {
    const veredicto = juzgarCapacidadesAnpr({});
    expect(veredicto.admite).toBe(false);
    expect(veredicto.detalle).toMatch(/no se siga adelante/i);
    expect(veredicto.sinRespuesta).toHaveLength(4);
  });

  it('y se conserva DE DÓNDE salió cada señal', () => {
    const veredicto = juzgarCapacidadesAnpr({ trafico: '<TrafficCap><plateCap/></TrafficCap>' });
    expect(veredicto.senales[0]?.fuente).toBe('trafico');
  });
});

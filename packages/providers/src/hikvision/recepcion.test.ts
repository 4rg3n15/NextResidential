import { describe, expect, it } from 'vitest';
import { recibirPublicacionDeEquipo } from './recepcion';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA ENTRADA DEL TRANSPORTE DE ESCUCHA · y lo que NO puede hacer nunca
 *
 * **No lanza.** La guía del fabricante dice que si el integrador no responde, el
 * equipo da la notificación por perdida y la sube otra vez. Una excepción aquí
 * acabaría en un `500`, el equipo lo leería como «no te he recibido» y lo
 * reenviaría en bucle con el mismo resultado.
 *
 * Por eso cada desenlace es un valor: quien recibe puede contestar `200 OK`
 * siempre —que es lo que el protocolo exige— y registrar el rechazo donde
 * alguien pueda verlo.
 */

const AHORA = new Date('2026-09-23T12:00:00.000Z');
const DISPOSITIVO = 'disp-camara';
const TIPO = 'multipart/form-data; boundary=B';

const xml = (extra = ''): string =>
  '<?xml version="1.0" encoding="UTF-8"?><EventNotificationAlert version="2.0">' +
  '<eventType>ANPR</eventType><licensePlate>ABC123</licensePlate>' +
  `<confidenceLevel>92</confidenceLevel><alarmDataType>0</alarmDataType>${extra}` +
  '</EventNotificationAlert>';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x80, 0xfe, 0xff, 0xd9]);

const sobre = (cuerpo: string, partes: readonly (readonly [string, Buffer])[] = []): Buffer =>
  Buffer.concat([
    Buffer.from('--B\r\nContent-Disposition: form-data; name="anpr.xml"\r\n'),
    Buffer.from('Content-Type: text/xml\r\n\r\n'),
    Buffer.from(cuerpo),
    Buffer.from('\r\n'),
    ...partes.flatMap(([nombre, datos]) => [
      Buffer.from(`--B\r\nContent-Disposition: form-data; name="${nombre}"\r\n`),
      Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
      datos,
      Buffer.from('\r\n'),
    ]),
    Buffer.from('--B--\r\n'),
  ]);

describe('los cuatro desenlaces', () => {
  it('una lectura de placa sigue adelante, con su publicación', () => {
    const r = recibirPublicacionDeEquipo(sobre(xml()), TIPO, DISPOSITIVO, AHORA);
    expect(r.desenlace).toBe('lectura');
    expect(r.publicacion?.evento.placa).toBe('ABC123');
    expect(r.publicacion?.transporte).toBe('escucha');
  });

  it('lo HISTÓRICO se corta aquí y no llega a nadie', () => {
    // Sin esto, la portería mostraría accesos de hace días como si ocurrieran
    // ahora, en una tabla append-only que no se puede limpiar.
    const historico = xml().replace('<alarmDataType>0<', '<alarmDataType>1<');
    const r = recibirPublicacionDeEquipo(sobre(historico), TIPO, DISPOSITIVO, AHORA);
    expect(r.desenlace).toBe('historico');
    expect(r.publicacion).toBeNull();
  });

  it('un evento que no es de placa se acepta y se ignora', () => {
    const otro =
      '<EventNotificationAlert><eventType>tamperDetection</eventType>' +
      '<alarmDataType>0</alarmDataType></EventNotificationAlert>';
    const r = recibirPublicacionDeEquipo(sobre(otro), TIPO, DISPOSITIVO, AHORA);
    expect(r.desenlace).toBe('sin_placa');
  });

  it('un sobre ilegible NO LANZA: devuelve su desenlace', () => {
    const r = recibirPublicacionDeEquipo(Buffer.from('basura'), TIPO, DISPOSITIVO, AHORA);
    expect(r.desenlace).toBe('ilegible');
    expect(r.motivo.length).toBeGreaterThan(0);
  });

  it('ni con un tipo de contenido que no es multipart', () => {
    const r = recibirPublicacionDeEquipo(sobre(xml()), 'text/plain', DISPOSITIVO, AHORA);
    expect(r.desenlace).toBe('ilegible');
  });

  it('un sobre cuyo XML no reconoce el analizador también es ilegible', () => {
    const r = recibirPublicacionDeEquipo(sobre('<OtraCosa/>'), TIPO, DISPOSITIVO, AHORA);
    expect(r.desenlace).toBe('ilegible');
  });
});

describe('lo que el receptor tiene que poder alertar', () => {
  it('H-16-1 · los recortes de ROSTRO se cuentan, no se tiran en silencio', () => {
    // Cualquier número distinto de cero es un equipo mal configurado en la red,
    // no una curiosidad estadística.
    const r = recibirPublicacionDeEquipo(
      sobre(xml(), [
        ['pilotPicture', JPEG],
        ['copilotPicture', JPEG],
      ]),
      TIPO,
      DISPOSITIVO,
      AHORA,
    );
    expect(r.partesBiometricasRechazadas).toBe(2);
    // Y el acceso SIGUE su curso: la lectura de placa era legítima.
    expect(r.desenlace).toBe('lectura');
  });

  it('y no acaban en la evidencia', () => {
    const r = recibirPublicacionDeEquipo(
      sobre(xml(), [['pilotPicture', JPEG]]),
      TIPO,
      DISPOSITIVO,
      AHORA,
    );
    expect(r.publicacion?.foto).toBeNull();
    expect(r.publicacion?.recorte).toBeNull();
  });

  it('una hora SIN desplazamiento se marca, para que se vea en la puesta en marcha', () => {
    const conHoraLocal = xml('<dateTime>2026-09-23T07:00:00</dateTime>');
    const r = recibirPublicacionDeEquipo(sobre(conHoraLocal), TIPO, DISPOSITIVO, AHORA);
    expect(r.horaSinDesplazamiento).toBe(true);
    expect(r.publicacion?.evento.ocurridoEn).toEqual(AHORA);
  });

  it('y con desplazamiento, no', () => {
    const conOffset = xml('<dateTime>2026-09-23T07:00:00-05:00</dateTime>');
    const r = recibirPublicacionDeEquipo(sobre(conOffset), TIPO, DISPOSITIVO, AHORA);
    expect(r.horaSinDesplazamiento).toBe(false);
  });

  it('las imágenes admisibles SÍ viajan', () => {
    const r = recibirPublicacionDeEquipo(
      sobre(xml(), [['detectionPicture', JPEG]]),
      TIPO,
      DISPOSITIVO,
      AHORA,
    );
    expect(r.publicacion?.foto).not.toBeNull();
  });
});

describe('6.7a · el evento en JSON entra por el mismo receptor', () => {
  const sobreJson = (cuerpo: string): Buffer =>
    Buffer.concat([
      Buffer.from('--B\r\nContent-Disposition: form-data; name="anpr.json"\r\n'),
      Buffer.from('Content-Type: application/json\r\n\r\n'),
      Buffer.from(cuerpo),
      Buffer.from('\r\n--B--\r\n'),
    ]);

  it('una lectura en JSON produce la misma publicación que en XML', () => {
    const json = JSON.stringify({
      eventType: 'ANPR',
      alarmDataType: 0,
      ANPR: { licensePlate: 'ABC123', confidenceLevel: 92 },
    });
    const r = recibirPublicacionDeEquipo(sobreJson(json), TIPO, DISPOSITIVO, AHORA);
    expect(r.desenlace).toBe('lectura');
    expect(r.publicacion?.evento.placa).toBe('ABC123');
    expect(r.publicacion?.evento.confianza).toBe(0.92);
  });

  it('un JSON histórico se descarta como histórico, no como ilegible', () => {
    const json = JSON.stringify({ eventType: 'ANPR', ANPR: { licensePlate: 'ABC123' } });
    expect(recibirPublicacionDeEquipo(sobreJson(json), TIPO, DISPOSITIVO, AHORA).desenlace).toBe(
      'historico',
    );
  });

  it('un JSON roto es ilegible, y NO lanza', () => {
    expect(recibirPublicacionDeEquipo(sobreJson('{roto'), TIPO, DISPOSITIVO, AHORA).desenlace).toBe(
      'ilegible',
    );
  });
});

/**
 * A2 (ETAPA 15-E) · la terminal facial entra por el MISMO receptor que la
 * cámara. Publica JSON —dentro de un multipart cuando adjunta foto, a secas
 * cuando no— y lo que cruza la frontera es un `rostro` que sigue adelante.
 */
describe('A2 · el rostro de la terminal sigue adelante', () => {
  const EVENTO_DE_TERMINAL = JSON.stringify({
    eventType: 'AccessControllerEvent',
    dateTime: '2026-09-25T07:00:00-05:00',
    alarmDataType: 0,
    AccessControllerEvent: { employeeNoString: 'plantilla-77', remoteCheck: true, serialNo: 9 },
  });

  it('como cuerpo JSON a secas (sin foto), el desenlace es `rostro` con su publicación', () => {
    const r = recibirPublicacionDeEquipo(
      Buffer.from(EVENTO_DE_TERMINAL),
      'application/json',
      'disp-terminal',
      AHORA,
    );
    expect(r.desenlace).toBe('rostro');
    expect(r.publicacion?.evento.clase).toBe('rostro');
    expect(r.publicacion?.evento.personaId).toBe('plantilla-77');
    expect(r.publicacion?.evento.esperaVeredicto).toBe(true);
    expect(r.publicacion?.evento.serieDelEquipo).toBe(9);
    expect(r.publicacion?.foto).toBeNull();
  });

  it('dentro de un multipart, la parte del evento se reconoce por su Content-Type JSON', () => {
    const cuerpo = Buffer.concat([
      Buffer.from('--B\r\nContent-Disposition: form-data; name="event_log"\r\n'),
      Buffer.from('Content-Type: application/json\r\n\r\n'),
      Buffer.from(EVENTO_DE_TERMINAL),
      Buffer.from('\r\n--B--\r\n'),
    ]);
    const r = recibirPublicacionDeEquipo(cuerpo, TIPO, 'disp-terminal', AHORA);
    expect(r.desenlace).toBe('rostro');
    expect(r.motivo).toMatch(/espera veredicto/);
  });

  it('un rostro HISTÓRICO tampoco sigue adelante', () => {
    const historico = EVENTO_DE_TERMINAL.replace('"alarmDataType":0', '"alarmDataType":1');
    const r = recibirPublicacionDeEquipo(
      Buffer.from(historico),
      'application/json',
      'disp-terminal',
      AHORA,
    );
    expect(r.desenlace).toBe('historico');
  });
});

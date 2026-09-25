import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { sobreDeLectura } from '@ncr/providers';
import { COP_A, crearApp, crearFirmante } from './utilidades';

/**
 * EL EXTREMO QUE LA CÁMARA PUBLICA, POR HTTP Y CONTRA LA APLICACIÓN REAL.
 *
 * Lo que se demuestra aquí es lo que el banco en memoria SÍ puede demostrar:
 * que la ruta **no queda abierta** por estar exenta de sesión, que el sobre se
 * abre de verdad y que un cuerpo ilegible no inventa un evento. La rama del
 * permitido —la que acciona un relé— se prueba en
 * `src/alarmserver/presentacion/alarm-server.controller.test.ts`, porque sin
 * padrón toda decisión sale denegada y aquí nunca se recorrería.
 *
 * H-15-1 en una prueba: la acreditación son DOS cosas —secreto y origen— y
 * fallar cualquiera de las dos da el MISMO 401 con el mismo texto. Un mensaje
 * que distinguiera «secreto correcto, origen no» le confirma a quien lo intenta
 * que ya tiene la mitad.
 */

const SECRETO = 'f'.repeat(48);
const DISPOSITIVO = 'camara-entrada';

/**
 * En el banco, supertest se conecta por el bucle local: el origen que ve la
 * aplicación es `127.0.0.1` en su forma IPv6. Declararlo así es lo que hace que
 * la comprobación de origen se EJERCITE en vez de saltarse.
 */
const ORIGEN_DEL_BANCO = '127.0.0.1,::1';

const XML =
  '<?xml version="1.0" encoding="UTF-8"?><EventNotificationAlert>' +
  '<eventType>ANPR</eventType><licensePlate>XYZ789</licensePlate>' +
  '<confidenceLevel>88</confidenceLevel><eventId>ev-e2e-1</eventId>' +
  '<alarmDataType>0</alarmDataType></EventNotificationAlert>';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x9a, 0xfe, 0xff, 0xd9]);

const sobre = (xml = XML): Buffer =>
  Buffer.concat([
    Buffer.from('--LIMITE\r\nContent-Disposition: form-data; name="anpr.xml"\r\n'),
    Buffer.from('Content-Type: text/xml\r\n\r\n'),
    Buffer.from(xml),
    Buffer.from('\r\n--LIMITE\r\nContent-Disposition: form-data; name="detectionPicture"\r\n'),
    Buffer.from('Content-Type: image/jpeg\r\n\r\n'),
    JPEG,
    Buffer.from('\r\n--LIMITE--\r\n'),
  ]);

describe('receptor del servidor de alarma', () => {
  let app: INestApplication;

  const publicar = (secreto: string, cuerpo: Buffer = sobre()) =>
    request(app.getHttpServer())
      .post(`/alarm-server/${secreto}`)
      .set('content-type', 'multipart/form-data; boundary=LIMITE')
      .send(cuerpo);

  beforeAll(async () => {
    app = await crearApp(await crearFirmante(), undefined, {
      ALARM_SERVER_EQUIPOS: `${COP_A}|${DISPOSITIVO}|${SECRETO}|${ORIGEN_DEL_BANCO}`,
    });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('con un secreto inventado: 401, aunque la ruta sea pública', async () => {
    await publicar('z'.repeat(48)).expect(401);
  });

  it('con un PREFIJO del secreto correcto: 401 igual', async () => {
    // La comparación es en tiempo constante; acertar 47 de 48 no vale nada.
    await publicar(SECRETO.slice(0, -1)).expect(401);
  });

  it('el 401 no dice QUÉ falló', async () => {
    const respuesta = await publicar('z'.repeat(48));
    expect(JSON.stringify(respuesta.body)).not.toMatch(/secreto|origen|equipo/i);
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * 200 SIEMPRE, Y `Connection: close` · REQUISITO DEL PROTOCOLO
   *
   * Guía del fabricante: «si el integrador no responde, el dispositivo
   * considerará la notificación perdida y la subirá otra vez». Este extremo
   * devolvía 202 y, ante un sobre roto, 400 — que para el equipo significa «no
   * te he recibido» y produce una cámara martilleando con el mismo envío malo.
   */
  it('con el secreto correcto y desde el origen declarado: 200 y Connection close', async () => {
    const respuesta = await publicar(SECRETO).expect(200);
    expect(respuesta.body).toMatchObject({ aceptado: true });
    expect(respuesta.headers['connection']).toBe('close');
  });

  it('un cuerpo ilegible también es 200: un error lo haría reenviar en bucle', async () => {
    const respuesta = await publicar(SECRETO, Buffer.from('<EventNotificationAlert/>')).expect(200);
    expect(respuesta.body).toMatchObject({ aceptado: true, ignorado: true });
  });

  it('el volcado HISTÓRICO del equipo se acepta y NO se procesa', async () => {
    const historico = sobreDeLectura({ placa: 'HIS123', alarmDataType: '1' });
    const respuesta = await request(app.getHttpServer())
      .post(`/alarm-server/${SECRETO}`)
      .set('content-type', historico.tipoDeContenido)
      .send(historico.cuerpo)
      .expect(200);
    expect(respuesta.body.motivo).toMatch(/histórico/);
  });

  it('H-16-1 · un sobre con RECORTES DE ROSTRO se acepta y los descarta', async () => {
    // Un equipo mal configurado enviando biometría sin consentimiento no puede
    // tumbar el acceso, pero tampoco puede colar el rostro.
    const conRostros = sobreDeLectura({ placa: 'ROS123' }, { conRostros: true });
    await request(app.getHttpServer())
      .post(`/alarm-server/${SECRETO}`)
      .set('content-type', conRostros.tipoDeContenido)
      .send(conRostros.cuerpo)
      .expect(200);
  });

  it('acepta el secreto por `Basic`, que es la forma que no queda en los registros', async () => {
    await request(app.getHttpServer())
      .post('/alarm-server/no-es-el-secreto')
      .set('content-type', 'multipart/form-data; boundary=LIMITE')
      .set('authorization', `Basic ${Buffer.from(`equipo:${SECRETO}`).toString('base64')}`)
      .send(sobre())
      .expect(200);
  });

  /**
   * A2 (ETAPA 15-E) · la terminal facial publica en el MISMO receptor, como
   * JSON a secas cuando no adjunta foto. Sin plantilla gestionada el motor
   * niega —no hay a quién atribuirlo— y el equipo recibe su veredicto por el
   * proveedor; lo que se afirma por HTTP es que el sobre ENTRA y se procesa.
   */
  it('A2 · el evento JSON de una terminal entra por el mismo receptor y se procesa', async () => {
    const evento = JSON.stringify({
      eventType: 'AccessControllerEvent',
      dateTime: '2026-09-25T07:00:00-05:00',
      alarmDataType: 0,
      AccessControllerEvent: {
        employeeNoString: 'plantilla-sin-gestionar',
        remoteCheck: true,
        serialNo: 1,
      },
    });
    const respuesta = await request(app.getHttpServer())
      .post(`/alarm-server/${SECRETO}`)
      .set('content-type', 'application/json')
      .send(evento)
      .expect(200);
    // No es «ignorado»: el rostro se ingirió y quedó evento (negado). Que no
    // haya `ignorado: true` es lo que distingue un receptor que lo procesa de
    // uno que lo tira con un 200.
    expect(respuesta.body).toEqual({ aceptado: true });
  });

  it('un evento que no es una lectura de placa se acepta y se ignora', async () => {
    const otro =
      '<EventNotificationAlert><eventType>IO</eventType>' +
      '<alarmDataType>0</alarmDataType></EventNotificationAlert>';
    const respuesta = await publicar(SECRETO, sobre(otro)).expect(200);
    expect(respuesta.body.ignorado).toBe(true);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * LAS DOS MITADES DEL RECORRIDO DE PLACA, ENFRENTADAS · ADR-03
   *
   * El sobre lo construye **la cámara simulada de `@ncr/providers`**, no esta
   * prueba. La diferencia no es de estilo: un sobre escrito aquí a la medida
   * del receptor confirmaría lo que el autor ya creía. Con el simulado, lo que
   * se comprueba es que lo que la cámara produce es exactamente lo que el
   * receptor sabe abrir, y el día que la captura real cambie los nombres, el
   * cambio va a un solo sitio y esto se pone rojo si no cuadra.
   */
  it('recorrido de placa completo con la cámara simulada', async () => {
    const sobreReal = sobreDeLectura({ placa: 'TSM123', confianza: 91, referencia: 'ev-e2e-2' });
    const respuesta = await request(app.getHttpServer())
      .post(`/alarm-server/${SECRETO}`)
      .set('content-type', sobreReal.tipoDeContenido)
      .send(sobreReal.cuerpo)
      .expect(200);
    expect(respuesta.body).toMatchObject({ aceptado: true });
    expect(respuesta.body.ignorado).toBeUndefined();
  });

  it('el mismo hecho DOS veces no produce dos accesos (RN-17)', async () => {
    // La cámara reenvía cuando no recibe respuesta a tiempo. La referencia del
    // equipo es lo que hace que el segundo envío se deduplique en vez de abrir
    // la talanquera una segunda vez sin nadie delante.
    const repetido = sobreDeLectura({ placa: 'DUP456', referencia: 'ev-repetido' });
    const enviar = () =>
      request(app.getHttpServer())
        .post(`/alarm-server/${SECRETO}`)
        .set('content-type', repetido.tipoDeContenido)
        .send(repetido.cuerpo);

    await enviar().expect(200);
    await enviar().expect(200);
  });

  it('la cámara que sólo manda la escena tampoco rompe', async () => {
    // Hay firmware que no envía recorte. Si no se prueba, nadie sabe que el
    // receptor no lo distingue.
    const sinRecorte = sobreDeLectura({ placa: 'ESC789' }, { conRecorte: false });
    await request(app.getHttpServer())
      .post(`/alarm-server/${SECRETO}`)
      .set('content-type', sinRecorte.tipoDeContenido)
      .send(sinRecorte.cuerpo)
      .expect(200);
  });
});

describe('sin equipos declarados, el extremo no acredita a nadie', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Es la configuración POR OMISIÓN, y por eso se prueba: un despliegue que
    // todavía no declaró cámaras tiene que rechazar todo, no aceptar todo.
    app = await crearApp(await crearFirmante(), undefined, { ALARM_SERVER_EQUIPOS: undefined });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('cualquier secreto: 401', async () => {
    await request(app.getHttpServer())
      .post(`/alarm-server/${SECRETO}`)
      .set('content-type', 'multipart/form-data; boundary=LIMITE')
      .send(sobre())
      .expect(401);
  });
});

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
  '<confidenceLevel>88</confidenceLevel><eventId>ev-e2e-1</eventId></EventNotificationAlert>';

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

  it('con el secreto correcto y desde el origen declarado: 202', async () => {
    const respuesta = await publicar(SECRETO).expect(202);
    expect(respuesta.body).toMatchObject({ aceptado: true });
  });

  it('acepta el secreto por `Basic`, que es la forma que no queda en los registros', async () => {
    await request(app.getHttpServer())
      .post('/alarm-server/no-es-el-secreto')
      .set('content-type', 'multipart/form-data; boundary=LIMITE')
      .set('authorization', `Basic ${Buffer.from(`equipo:${SECRETO}`).toString('base64')}`)
      .send(sobre())
      .expect(202);
  });

  it('un cuerpo que no es un sobre: 400, y no se inventa un evento', async () => {
    await publicar(SECRETO, Buffer.from('<EventNotificationAlert/>')).expect(400);
  });

  it('un evento que no es una lectura de placa se acepta y se ignora', async () => {
    const otro = '<EventNotificationAlert><eventType>IO</eventType></EventNotificationAlert>';
    const respuesta = await publicar(SECRETO, sobre(otro)).expect(202);
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
      .expect(202);
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

    await enviar().expect(202);
    await enviar().expect(202);
  });

  it('la cámara que sólo manda la escena tampoco rompe', async () => {
    // Hay firmware que no envía recorte. Si no se prueba, nadie sabe que el
    // receptor no lo distingue.
    const sinRecorte = sobreDeLectura({ placa: 'ESC789' }, { conRecorte: false });
    await request(app.getHttpServer())
      .post(`/alarm-server/${SECRETO}`)
      .set('content-type', sinRecorte.tipoDeContenido)
      .send(sinRecorte.cuerpo)
      .expect(202);
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

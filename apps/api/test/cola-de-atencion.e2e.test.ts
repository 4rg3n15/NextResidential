import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { REGISTRO_DE_EVENTOS_DE_EQUIPO } from '../src/eventos';
import type { RegistroDeEventosDeEquipo } from '../src/eventos';

/**
 * G1 · G2 · G3 (15-N) · LA COLA DE ATENCIÓN POR HTTP, DESDE LO QUE PUBLICA UN EQUIPO
 *
 * El caso de uso y la función pura ya prueban el orden, la vigencia y quién
 * entra. Esto prueba el CABLEADO: que la llamada que el videoportero publica
 * por el servidor de alarmas llega a la cola de ESE equipo con una alerta
 * sola; que el volcado histórico no dispara nada; que colgar y atender la
 * sacan; y que las preferencias de la copropiedad viajan con la cola.
 */
const SECRETO = 'c'.repeat(48);
// La portería de A del banco (EQUIPOS_DEL_BANCO): las órdenes exigen un equipo de la copropiedad.
const PORTERO = '70000000-0000-4000-8000-000000000001';
const ORIGEN_DEL_BANCO = '127.0.0.1,::1';

let app: INestApplication;
let firmante: Firmante;

// Cada evento del equipo trae su número de serie: el mismo número es el MISMO
// evento reenviado, y el receptor lo guarda una vez.
let serie = 0;
const llamada = (cmdType: string, alarmDataType = 0) =>
  JSON.stringify({
    eventType: 'videoIntercomEvent',
    dateTime: '2026-09-30T07:00:00-05:00',
    alarmDataType,
    VoiceTalkEvent: { cmdType, serialNo: (serie += 1), currentEvent: alarmDataType === 0 },
  });

const publicar = async (cuerpo: string) => {
  const r = await request(app.getHttpServer())
    .post(`/alarm-server/${SECRETO}`)
    .set('content-type', 'application/json')
    .send(cuerpo);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
};

const vaciar = () => app.get<RegistroDeEventosDeEquipo>(REGISTRO_DE_EVENTOS_DE_EQUIPO).vaciada();

const operador = () =>
  tokenDe(firmante, { rol: 'operador_central', copropiedadId: null, copropiedades: [COP_A] });

const cola = async () =>
  request(app.getHttpServer())
    .get(`/copropiedades/${COP_A}/guardia/cola`)
    .set('Authorization', `Bearer ${await operador()}`)
    .expect(200);

const alertasDelPortero = async () =>
  (
    await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/alertas`)
      .query({ dispositivoId: PORTERO })
      .set('Authorization', `Bearer ${await operador()}`)
      .expect(200)
  ).body as { tipo: string; notas: string | null }[];

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante, undefined, {
    ALARM_SERVER_EQUIPOS: `${COP_A}|${PORTERO}|${SECRETO}|${ORIGEN_DEL_BANCO}`,
  });
});
afterAll(async () => {
  await app?.close();
});

describe('G1 · qué llega a la cola desde un equipo', () => {
  it('sin nada en vivo, la cola está vacía y trae la vigencia y las preferencias por omisión', async () => {
    const r = await cola();
    expect(r.body.cola).toEqual([]);
    expect(r.body.vigenciaSegundos).toBe(300);
    expect(r.body.preferencias.llamada).toEqual({ abrir: true, sonar: true });
  });

  it('el volcado HISTÓRICO de una llamada no dispara nada', async () => {
    await publicar(llamada('request', 1));
    await vaciar();
    expect((await cola()).body.cola).toEqual([]);
    expect(await alertasDelPortero()).toEqual([]);
  });

  it('G3 · la llamada EN VIVO entra con el equipo que llama y abre UNA alerta', async () => {
    await publicar(llamada('request'));
    await publicar(llamada('request'));
    await vaciar();
    const r = await cola();
    expect(r.body.cola).toHaveLength(1);
    expect(r.body.cola[0]).toMatchObject({
      origen: 'equipo',
      disparador: 'llamada',
      dispositivoId: PORTERO,
      urgencia: 'normal',
      resultado: null,
    });
    const alertas = await alertasDelPortero();
    expect(alertas).toHaveLength(1);
    expect(alertas[0]?.tipo).toBe('acceso_dudoso');
  });

  it('colgar la llamada la saca de la cola (S-161)', async () => {
    await publicar(llamada('hangUp'));
    await vaciar();
    expect((await cola()).body.cola).toEqual([]);
  });

  it('una orden manual que NOMBRA el elemento lo da por atendido', async () => {
    await publicar(llamada('request'));
    await vaciar();
    const [elemento] = (await cola()).body.cola as { eventoId: string }[];
    expect(elemento).toBeDefined();
    const orden = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/guardia/ordenes`)
      .set('Authorization', `Bearer ${await operador()}`)
      .send({
        dispositivoId: PORTERO,
        accion: 'negar',
        motivo: 'El visitante no figura en ninguna autorización',
        eventoId: elemento?.eventoId,
      });
    expect(orden.status, JSON.stringify(orden.body)).toBe(201);
    expect((await cola()).body.cola).toEqual([]);
  });
});

describe('G2 · preferencias de atención por copropiedad', () => {
  const admin = () => tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  const todas = (abrir: boolean, sonar: boolean) => ({
    llamada: { abrir, sonar },
    rostro: { abrir, sonar },
    placa: { abrir, sonar },
    lista_negra: { abrir, sonar },
    dudoso: { abrir, sonar },
  });

  it('el administrador las cambia y la cola las devuelve', async () => {
    const cuerpo = { ...todas(true, true), placa: { abrir: true, sonar: false } };
    const r = await request(app.getHttpServer())
      .put(`/copropiedades/${COP_A}/guardia/preferencias`)
      .set('Authorization', `Bearer ${await admin()}`)
      .send(cuerpo)
      .expect(200);
    expect(r.body.placa).toEqual({ abrir: true, sonar: false });
    expect((await cola()).body.preferencias.placa).toEqual({ abrir: true, sonar: false });
  });

  it('un portero las lee pero no las cambia', async () => {
    const portero = await tokenDe(firmante, { rol: 'portero', copropiedadId: COP_A });
    await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/guardia/preferencias`)
      .set('Authorization', `Bearer ${portero}`)
      .expect(200);
    await request(app.getHttpServer())
      .put(`/copropiedades/${COP_A}/guardia/preferencias`)
      .set('Authorization', `Bearer ${portero}`)
      .send(todas(false, false))
      .expect(403);
  });

  it('un campo que el DTO no declara se rechaza', async () => {
    await request(app.getHttpServer())
      .put(`/copropiedades/${COP_A}/guardia/preferencias`)
      .set('Authorization', `Bearer ${await admin()}`)
      .send({ ...todas(true, true), panico: { abrir: false, sonar: false } })
      .expect(400);
  });

  it('las de otra copropiedad responden 404', async () => {
    await request(app.getHttpServer())
      .put(`/copropiedades/${COP_B}/guardia/preferencias`)
      .set('Authorization', `Bearer ${await admin()}`)
      .send(todas(false, false))
      .expect(404);
  });
});

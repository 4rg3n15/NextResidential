import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { REGISTRO_DE_EVENTOS_DE_EQUIPO } from '../src/eventos';
import type { RegistroDeEventosDeEquipo } from '../src/eventos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CORRECCIÓN 15-S1 · B.4 · LA LLAMADA A LA CENTRAL DESDE LA TERMINAL (5/51)
 *
 * Requisito del cliente: la guardia habla por la terminal igual que por el
 * videoportero. La terminal llama con un evento de control de acceso —«Other
 * Events» 0x5 / 0x33 «Call Center», ya en el catálogo de eventos (G3, 15-N)—,
 * no con el `VoiceTalkEvent` del videoportero. Esto prueba el CABLEADO entero:
 * publicada por el servidor de alarmas, entra en la cola como `llamada` con
 * ESE equipo, que es el que la consola propone para el audio y el video.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SECRETO = 'd'.repeat(48);
// La terminal de A del banco (EQUIPOS_DEL_BANCO).
const TERMINAL = '90000000-0000-4000-8000-000000000001';
const ORIGEN_DEL_BANCO = '127.0.0.1,::1';

let app: INestApplication;
let firmante: Firmante;
let serie = 0;

const llamadaDeLaTerminal = (subEventType = 51) =>
  JSON.stringify({
    eventType: 'AccessControllerEvent',
    dateTime: '2026-10-07T09:00:00-05:00',
    alarmDataType: 0,
    AccessControllerEvent: {
      majorEventType: 5,
      subEventType,
      serialNo: (serie += 1),
      currentEvent: true,
    },
  });

const publicar = async (cuerpo: string) => {
  const r = await request(app.getHttpServer())
    .post(`/alarm-server/${SECRETO}`)
    .set('content-type', 'application/json')
    .send(cuerpo);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
};

const token = () =>
  tokenDe(firmante, { rol: 'operador_central', copropiedadId: null, copropiedades: [COP_A] });

/** G2 (15-N) · la llamada —y sólo la llamada— abre su alerta: el camino de la CLASE `llamada`. */
const alertasDeLaTerminal = async () =>
  (
    await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/alertas`)
      .query({ dispositivoId: TERMINAL })
      .set('Authorization', `Bearer ${await token()}`)
      .expect(200)
  ).body as { tipo: string }[];

const cola = async () =>
  (
    await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/guardia/cola`)
      .set('Authorization', `Bearer ${await token()}`)
      .expect(200)
  ).body as { cola: Record<string, unknown>[] };

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante, undefined, {
    ALARM_SERVER_EQUIPOS: `${COP_A}|${TERMINAL}|${SECRETO}|${ORIGEN_DEL_BANCO}`,
  });
});
afterAll(async () => {
  await app?.close();
});

describe('15-S1 · B.4 · la terminal llama a la central (5/51)', () => {
  it('entra en la cola como «llamada», con la TERMINAL como el equipo de audio y video', async () => {
    await publicar(llamadaDeLaTerminal());
    await app.get<RegistroDeEventosDeEquipo>(REGISTRO_DE_EVENTOS_DE_EQUIPO).vaciada();
    const { cola: elementos } = await cola();
    expect(elementos).toHaveLength(1);
    expect(elementos[0]).toMatchObject({
      origen: 'equipo',
      disparador: 'llamada',
      dispositivoId: TERMINAL,
      titulo: 'Llamada a la central',
    });
    // Y por el camino de la llamada (clase, no sólo tipo): abre UNA alerta.
    const alertas = await alertasDeLaTerminal();
    expect(alertas).toHaveLength(1);
    expect(alertas[0]?.tipo).toBe('acceso_dudoso');
  });

  it('otro evento de la misma familia (5/25, puerta abierta) no es una llamada', async () => {
    await publicar(llamadaDeLaTerminal(25));
    await app.get<RegistroDeEventosDeEquipo>(REGISTRO_DE_EVENTOS_DE_EQUIPO).vaciada();
    const llamadas = (await cola()).cola.filter((e) => e['disparador'] === 'llamada');
    expect(llamadas).toHaveLength(1);
  });
});

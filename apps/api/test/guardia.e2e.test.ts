import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';

/**
 * CONSOLAS OPERATIVAS · lo que estas pruebas persiguen por HTTP.
 *
 * El caso de uso ya comprueba que sin motivo no se acciona. Esto comprueba lo
 * otro: que **la ruta no ofrece un camino que se lo salte**. Un caso de uso
 * correcto detrás de un controlador que valida por su cuenta, o que acepta un
 * campo que el DTO no declara, deja la regla intacta y el sistema abierto.
 */
let app: INestApplication;
let firmante: Firmante;

const MOTIVO = 'Visitante esperado por la vivienda 4, confirmado por teléfono';
const DISPOSITIVO = '20000000-0000-4000-8000-000000000001';

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
});
afterAll(async () => {
  await app?.close();
});

const como = async (rol: Parameters<typeof tokenDe>[1]['rol'], copropiedadId: string | null) =>
  tokenDe(firmante, { rol, copropiedadId });

describe('RN-08 · CA-16 · CA-17 — sin motivo NO se acciona, tampoco por HTTP', () => {
  it('sin motivo: 400, y la orden no llega a la bitácora', async () => {
    const token = await como('portero', COP_B);
    const res = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/guardia/ordenes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dispositivoId: DISPOSITIVO, accion: 'abrir' });
    expect(res.status).toBe(400);

    const historial = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_B}/guardia/ordenes`)
      .set('Authorization', `Bearer ${token}`);
    expect(historial.body.ordenes).toHaveLength(0);
  });

  it('un motivo de espacios no cuela por el ValidationPipe ni por el dominio', async () => {
    const token = await como('portero', COP_B);
    const res = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/guardia/ordenes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dispositivoId: DISPOSITIVO, accion: 'abrir', motivo: '              ' });
    expect(res.status).toBe(400);
  });

  it('con motivo: 201, se normaliza y queda atribuida al operador', async () => {
    const token = await como('portero', COP_B);
    const res = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/guardia/ordenes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dispositivoId: DISPOSITIVO, accion: 'abrir', motivo: `  ${MOTIVO}  ` });
    expect(res.status).toBe(201);
    expect(res.body.motivo).toBe(MOTIVO);
    expect(res.body.operadorId).toBeDefined();
    expect(res.body.rol).toBe('portero');
  });

  it('NEGAR también queda registrado: RN-02 no distingue', async () => {
    const token = await como('portero', COP_B);
    const res = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/guardia/ordenes`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        dispositivoId: DISPOSITIVO,
        accion: 'negar',
        motivo: 'No figura en la autorización',
      });
    expect(res.status).toBe(201);
    expect(res.body.accion).toBe('negar');
  });

  it('un campo que el DTO no declara se rechaza antes de llegar al dominio', async () => {
    // `forbidNonWhitelisted`. Sin él, un cuerpo podría traer `operadorId` y
    // atribuir la apertura a otra persona.
    const token = await como('portero', COP_B);
    const res = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/guardia/ordenes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dispositivoId: DISPOSITIVO, accion: 'abrir', motivo: MOTIVO, operadorId: 'otro' });
    expect(res.status).toBe(400);
  });

  it('un residente no acciona puertas: 403', async () => {
    const token = await como('residente', COP_B);
    const res = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/guardia/ordenes`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dispositivoId: DISPOSITIVO, accion: 'abrir', motivo: MOTIVO });
    expect(res.status).toBe(403);
  });
});

describe('KPI-35 · el operador de central conmuta sin ver nada de la otra', () => {
  it('sólo alcanza las copropiedades de su turno', async () => {
    const token = await tokenDe(firmante, {
      rol: 'operador_central',
      copropiedadId: null,
      copropiedades: [COP_B],
    });
    const suya = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_B}/guardia/cola`)
      .set('Authorization', `Bearer ${token}`);
    expect(suya.status).toBe(200);

    // La que no está en su turno responde 404, no 403: un 403 confirmaría que
    // existe, y contando respuestas se enumeran los tenants.
    const ajena = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/guardia/cola`)
      .set('Authorization', `Bearer ${token}`);
    expect(ajena.status).toBe(404);
  });

  it('el historial de órdenes de otra copropiedad no se filtra', async () => {
    const token = await como('portero', COP_B);
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/guardia/ordenes`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('ADR-01 · el canal de audio admite una conversación a la vez', () => {
  it('el primero tiene la palabra; el segundo se ENCOLA, no se rechaza', async () => {
    const uno = await tokenDe(firmante, {
      rol: 'operador_central',
      copropiedadId: null,
      copropiedades: [COP_B],
      usuarioId: '30000000-0000-4000-8000-00000000000a',
    });
    const dos = await tokenDe(firmante, {
      rol: 'operador_central',
      copropiedadId: null,
      copropiedades: [COP_B],
      usuarioId: '30000000-0000-4000-8000-00000000000b',
    });

    const abrir = (token: string) =>
      request(app.getHttpServer())
        .post(`/copropiedades/${COP_B}/guardia/intercom/abrir`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dispositivoId: DISPOSITIVO });

    const a = await abrir(uno);
    expect(a.status).toBe(200);
    expect(a.body.estado).toBe('abierta');

    const b = await abrir(dos);
    // 200 y `en_espera`, no 409: el operador necesita saber cuándo le toca, no
    // reintentar a ciegas contra un canal que no sabe cuándo se libera.
    expect(b.status).toBe(200);
    expect(b.body.estado).toBe('en_espera');
    expect(b.body.porDelante).toBe(1);

    // Al soltar, la palabra pasa al que esperaba en el mismo acto.
    const cierre = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/guardia/intercom/cerrar`)
      .set('Authorization', `Bearer ${uno}`)
      .send({ dispositivoId: DISPOSITIVO });
    expect(cierre.status).toBe(200);

    const estadoDeB = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_B}/guardia/intercom/${DISPOSITIVO}`)
      .set('Authorization', `Bearer ${dos}`);
    expect(estadoDeB.body.titular).toBe('30000000-0000-4000-8000-00000000000b');
  });

  it('el canal de OTRA copropiedad no se alcanza', async () => {
    const token = await como('portero', COP_B);
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/guardia/intercom/${DISPOSITIVO}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('HU-29 · emergencia', () => {
  it('exige motivo y escala con severidad crítica', async () => {
    // El operador de central alcanza por su TURNO, no por pertenencia: su
    // `copropiedadId` es nulo y el alcance sale de `copropiedades`.
    const token = await tokenDe(firmante, {
      rol: 'operador_central',
      copropiedadId: null,
      copropiedades: [COP_B],
    });
    const sinMotivo = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/guardia/emergencia`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(sinMotivo.status).toBe(400);

    const conMotivo = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_B}/guardia/emergencia`)
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Intento de forzar la talanquera vehicular' });
    expect(conMotivo.status).toBe(202);
    expect(conMotivo.body.aceptado).toBe(true);
  });
});

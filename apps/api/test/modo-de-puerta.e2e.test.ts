import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante, Identidad } from './utilidades';
import { RELOJ } from '@ncr/domain-core';
import { MockProvider, PERFIL_IDEAL } from '@ncr/providers';
import { PROVEEDOR_DIRECTO } from '../src/proveedores/proveedores.module';
import { relojFijo } from '../src/eventos/aplicacion/dobles';
import { BarrerReversionesDePuertas } from '../src/guardia/aplicacion/reversion-de-puertas';
import { PLANIFICADOR } from '../src/planificacion';
import type { Planificador } from '../src/planificacion';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · C6 · PUERTA LIBRE Y BLOQUEADA, POR HTTP (P-25)
 *
 * El guard declarativo (403 a todo rol que no administre), el 400 sin motivo,
 * la orden que llega al proveedor, la vista de la consola (quién, por qué,
 * desde y hasta cuándo), «revertir ahora», la duración máxima configurable y
 * su tope, y la reversión al vencer con un reloj inyectado. Sin base: la
 * reversión tras reiniciar la API está en `modo-de-puerta-pg.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const EQUIPO = '70000000-0000-4000-8000-000000000001'; // «Portería de A», del banco
const reloj = relojFijo(new Date('2026-10-03T12:00:00Z'));
let app: INestApplication;
let firmante: Firmante;

const como = (identidad: Identidad) => tokenDe(firmante, identidad);
const admin = () => como({ rol: 'administrador', copropiedadId: COP_A });
const ruta = (sufijo: string, cop = COP_A) => `/copropiedades/${cop}/puertas/${sufijo}`;
const libre = {
  dispositivoId: EQUIPO,
  numeroDePuerta: 1,
  modo: 'libre',
  motivo: 'Mudanza del 302',
};

beforeAll(async () => {
  firmante = await crearFirmante();
  // El simulado de la suite sin base sólo conoce sus equipos fijos: éste conoce el del banco.
  const simulado = new MockProvider({ perfil: PERFIL_IDEAL, semilla: 1, dispositivos: [EQUIPO] });
  app = await crearApp(firmante, (b) =>
    b
      .overrideProvider(RELOJ)
      .useValue(reloj)
      .overrideProvider(PROVEEDOR_DIRECTO)
      .useValue(simulado),
  );
});
afterAll(async () => {
  await app?.close();
});

describe('C2 · sólo la administración, con motivo', () => {
  it.each<Identidad['rol']>(['portero', 'operador_central', 'residente'])(
    '%s recibe 403 y la puerta no cambia',
    async (rol) => {
      const token = await como({
        rol,
        copropiedadId: rol === 'operador_central' ? null : COP_A,
        ...(rol === 'operador_central' ? { copropiedades: [COP_A] } : {}),
      });
      await request(app.getHttpServer())
        .post(ruta('modos'))
        .set('Authorization', `Bearer ${token}`)
        .send(libre)
        .expect(403);
    },
  );

  it('sin motivo, o con uno de relleno, 400', async () => {
    const auth = `Bearer ${await admin()}`;
    const sinMotivo = { ...libre, motivo: undefined };
    await request(app.getHttpServer())
      .post(ruta('modos'))
      .set('Authorization', auth)
      .send(sinMotivo)
      .expect(400);
    await request(app.getHttpServer())
      .post(ruta('modos'))
      .set('Authorization', auth)
      .send({ ...libre, motivo: 'abc' })
      .expect(400);
  });

  it('el administrador de B no toca un equipo de A', async () => {
    await request(app.getHttpServer())
      .post(ruta('modos', COP_B))
      .set('Authorization', `Bearer ${await como({ rol: 'administrador', copropiedadId: COP_B })}`)
      .send(libre)
      .expect(404);
  });
});

describe('C1/C3/C4 · la orden, la vista de la consola y la reversión', () => {
  it('libre: llega al equipo y la consola ve quién, por qué, desde y hasta cuándo', async () => {
    const auth = `Bearer ${await admin()}`;
    const res = await request(app.getHttpServer())
      .post(ruta('modos'))
      .set('Authorization', auth)
      .send(libre)
      .expect(201);
    expect(res.body).toMatchObject({
      resultado: 'aceptada',
      revierteEn: '2026-10-03T14:00:00.000Z',
    });
    const simulado = app.get<MockProvider>(PROVEEDOR_DIRECTO);
    expect(simulado.modosDeSalida.get(`${EQUIPO}:1`)).toBe('libre');

    const portero = await como({ rol: 'portero', copropiedadId: COP_A });
    const vista = await request(app.getHttpServer())
      .get(ruta('modos'))
      .set('Authorization', `Bearer ${portero}`)
      .expect(200);
    expect(vista.body.modos).toEqual([
      expect.objectContaining({
        dispositivoId: EQUIPO,
        numeroDePuerta: 1,
        modo: 'libre',
        motivo: 'Mudanza del 302',
        operadorId: '00000000-0000-4000-8000-000000000010',
        desde: '2026-10-03T12:00:00.000Z',
        revierteEn: '2026-10-03T14:00:00.000Z',
      }),
    ]);
  });

  it('el trabajo de reversión está dado de alta en el planificador', () => {
    const planificador = app.get<Planificador>(PLANIFICADOR, { strict: false });
    expect(planificador.programados.map((t) => t.nombre)).toContain('ncr.revertir-puertas');
  });

  it('al vencer el plazo (reloj inyectado) el barrido la devuelve a normal', async () => {
    const barrer = app.get(BarrerReversionesDePuertas);
    reloj.avanzar(119 * 60_000);
    expect(await barrer.ejecutar()).toMatchObject({ revertidas: 0 });
    reloj.avanzar(60_000);
    expect(await barrer.ejecutar()).toMatchObject({ revertidas: 1 });
    expect(app.get<MockProvider>(PROVEEDOR_DIRECTO).modosDeSalida.get(`${EQUIPO}:1`)).toBe(
      'normal',
    );
    const vista = await request(app.getHttpServer())
      .get(ruta('modos'))
      .set('Authorization', `Bearer ${await admin()}`)
      .expect(200);
    expect(vista.body.modos).toEqual([]);
  });

  it('revertir ahora, desde la consola, antes del plazo', async () => {
    const auth = `Bearer ${await admin()}`;
    await request(app.getHttpServer())
      .post(ruta('modos'))
      .set('Authorization', auth)
      .send({ ...libre, modo: 'bloqueada', motivo: 'Fumigación del lobby', minutos: 30 })
      .expect(201);
    await request(app.getHttpServer())
      .post(ruta('modos/reversion'))
      .set('Authorization', auth)
      .send({ dispositivoId: EQUIPO, numeroDePuerta: 1 })
      .expect(201);
    const vista = await request(app.getHttpServer()).get(ruta('modos')).set('Authorization', auth);
    expect(vista.body.modos).toEqual([]);
  });

  it('la duración máxima se configura, con tope; una orden no la supera', async () => {
    const auth = `Bearer ${await admin()}`;
    await request(app.getHttpServer())
      .put(ruta('ajustes'))
      .set('Authorization', auth)
      .send({ duracionMaximaMinutos: 10_000 })
      .expect(400);
    await request(app.getHttpServer())
      .put(ruta('ajustes'))
      .set('Authorization', auth)
      .send({ duracionMaximaMinutos: 60 })
      .expect(200);
    await request(app.getHttpServer())
      .post(ruta('modos'))
      .set('Authorization', auth)
      .send({ ...libre, minutos: 61 })
      .expect(400);
    await request(app.getHttpServer())
      .put(ruta('ajustes'))
      .set('Authorization', `Bearer ${await como({ rol: 'portero', copropiedadId: COP_A })}`)
      .send({ duracionMaximaMinutos: 700 })
      .expect(403);
  });
});

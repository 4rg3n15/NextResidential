import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  ControlDeIpDePorteros,
  MENSAJE_GUARDIA_REMOTA,
  ModoPruebas,
  ReglasDeIpEnMemoria,
} from '../src/plataforma';
import { COP_A, crearApp, crearFirmante, sinModoPruebas, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H4 c (15-L) · EL SUPERADMINISTRADOR NUNCA PASA POR LA REGLA DE IP
 *
 * La guarda de origen restringe al PORTERO; al superadministrador sólo le
 * anota desde dónde está. Esa asimetría se prueba aquí por HTTP, con la
 * guarda real y los dos estados del modo pruebas:
 *
 *  · desde una IP que NINGUNA lista autoriza, el superadministrador entra con
 *    el modo pruebas ACTIVO y con el modo pruebas APAGADO;
 *  · el control de IP de porteros ni siquiera se CONSULTA para él (espía);
 *  · el portero, desde esa MISMA IP, entra con «habría sido rechazado» si el
 *    modo pruebas está activo, y recibe 403 si está apagado.
 *
 * La IP del navegador llega en `X-Forwarded-For` desde el bucle local, que es
 * el proxy de confianza por omisión (H6). IPs de documentación (RFC 5737).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const IP_FUERA_DE_TODA_LISTA = '203.0.113.77';
const RUTA = `/copropiedades/${COP_A}/guardia/cola`;

let app: INestApplication;
let firmante: Firmante;
let superadmin = '';
let portero = '';

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  app.get(ReglasDeIpEnMemoria).fijar(COP_A, {
    ipsPorteria: ['192.0.2.10'],
    ipsRemotas: ['198.51.100.0/28'],
  });
  superadmin = await tokenDe(firmante, {
    rol: 'superadministrador',
    copropiedadId: null,
    usuarioId: '00000000-0000-4000-8000-0000000000a1',
    sesionId: randomUUID(),
  });
  portero = await tokenDe(firmante, { rol: 'portero', copropiedadId: COP_A });
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});

const pedir = (token: string) =>
  request(app.getHttpServer())
    .get(RUTA)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Forwarded-For', IP_FUERA_DE_TODA_LISTA);

/** Cuántas veces se consultó la regla de IP durante `fn`. */
const consultasDelControl = async (fn: () => Promise<void>): Promise<number> => {
  const espia = vi.spyOn(app.get(ControlDeIpDePorteros), 'evaluar');
  try {
    await fn();
    return espia.mock.calls.length;
  } finally {
    espia.mockRestore();
  }
};

describe('con el modo pruebas ACTIVO', () => {
  it('el modo pruebas arranca activo, como en la base', async () => {
    expect(await app.get(ModoPruebas).activo()).toBe(true);
  });

  it('el superadministrador entra desde fuera de toda lista, sin pasar por la regla', async () => {
    const consultas = await consultasDelControl(async () => {
      const r = await pedir(superadmin);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    });
    expect(consultas).toBe(0);
  });

  it('el portero desde la misma IP entra, pero la regla SÍ se consulta', async () => {
    const consultas = await consultasDelControl(async () => {
      const r = await pedir(portero);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    });
    expect(consultas).toBeGreaterThan(0);
  });
});

describe('con el modo pruebas APAGADO', () => {
  beforeAll(async () => {
    await sinModoPruebas(app);
  });

  it('el modo pruebas está apagado', async () => {
    expect(await app.get(ModoPruebas).activo()).toBe(false);
  });

  it('el superadministrador sigue entrando desde fuera de toda lista, sin pasar por la regla', async () => {
    const consultas = await consultasDelControl(async () => {
      const r = await pedir(superadmin);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    });
    expect(consultas).toBe(0);
  });

  it('el portero desde la misma IP recibe 403 con el texto exacto', async () => {
    const r = await pedir(portero);
    expect(r.status).toBe(403);
    expect(JSON.stringify(r.body)).toContain(MENSAJE_GUARDIA_REMOTA);
  });
});

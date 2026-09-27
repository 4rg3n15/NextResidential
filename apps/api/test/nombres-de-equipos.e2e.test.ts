import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import { EQUIPOS_DEL_BANCO } from './constantes';

/**
 * DT-15L-02 (corrección de la 15-L) · el portero ve el NOMBRE de cada equipo,
 * y nada más.
 *
 * La línea de tiempo de «Eventos y alertas» dice qué equipo emitió cada evento.
 * La lista completa de equipos es de administración —lleva la dirección, el
 * usuario de servicio y el estado de la credencial— y el portero veía «Equipo
 * sin nombre». La ruta de nombres existe para él: el nombre sí, lo demás no.
 */
let app: INestApplication;
let portero = '';
let central = '';
let residente = '';

beforeAll(async () => {
  const firmante = await crearFirmante();
  app = await crearApp(firmante);
  portero = await tokenDe(firmante, { rol: 'portero' });
  central = await tokenDe(firmante, {
    rol: 'operador_central',
    copropiedadId: null,
    copropiedades: [COP_A],
  });
  residente = await tokenDe(firmante, { rol: 'residente' });
});
afterAll(async () => {
  await app?.close();
});

const pedir = (token: string, ruta: string) =>
  request(app.getHttpServer()).get(ruta).set('Authorization', `Bearer ${token}`);

const DE_A = EQUIPOS_DEL_BANCO.filter((e) => e.copropiedadId === COP_A);

describe('DT-15L-02 · nombres de equipos para portería y central', () => {
  it('el portero ve el nombre de cada equipo de su copropiedad', async () => {
    const r = await pedir(portero, `/copropiedades/${COP_A}/nombres-de-equipos`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const nombres = (r.body as { nombre: string }[]).map((e) => e.nombre);
    for (const e of DE_A) expect(nombres).toContain(e.nombre);
  });

  it('y SÓLO el nombre: ni dirección, ni usuario, ni credencial', async () => {
    const r = await pedir(portero, `/copropiedades/${COP_A}/nombres-de-equipos`);
    for (const e of r.body as Record<string, unknown>[]) {
      expect(Object.keys(e).sort()).toEqual(['id', 'nombre']);
    }
    expect(JSON.stringify(r.body)).not.toMatch(/host|usuario|secreto|credencial|clave|puerto/i);
  });

  it('la lista completa sigue siendo de administración: el portero recibe 403', async () => {
    const r = await pedir(portero, `/copropiedades/${COP_A}/equipos`);
    expect(r.status).toBe(403);
  });

  it('central también la lee; el residente no', async () => {
    expect((await pedir(central, `/copropiedades/${COP_A}/nombres-de-equipos`)).status).toBe(200);
    expect((await pedir(residente, `/copropiedades/${COP_A}/nombres-de-equipos`)).status).toBe(403);
  });

  it('los de otra copropiedad no se ven', async () => {
    const r = await pedir(portero, `/copropiedades/${COP_B}/nombres-de-equipos`);
    expect([403, 404]).toContain(r.status);
    expect(JSON.stringify(r.body)).not.toContain('Talanquera de B');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { cargarConfiguracion } from '../src/configuracion/esquema';

/**
 * 15-Q2 · E2 · `GET /copropiedades/:id/guardia/video/ice` de punta a punta: lo
 * que la consola recibe sin STUN/TURN (la lista vacía de siempre, R1), lo que
 * recibe con ellos (TURN con credencial efímera, sin caché), y a quién no se
 * le da (otro rol, otra copropiedad).
 */
const SECRETO = 'secreto-del-turn-de-la-prueba-e2e-0123456789abcdef';
const OPERADOR = '00000000-0000-4000-8000-0000000000c7';
let firmante: Firmante;
let sin: INestApplication;
let con: INestApplication;

const pedir = async (
  app: INestApplication,
  identidad: Parameters<typeof tokenDe>[1],
  cop = COP_A,
) =>
  request(app.getHttpServer())
    .get(`/copropiedades/${cop}/guardia/video/ice`)
    .set('Authorization', `Bearer ${await tokenDe(firmante, identidad)}`);

beforeAll(async () => {
  firmante = await crearFirmante();
  sin = await crearApp(firmante);
  con = await crearApp(firmante, undefined, {
    WEBRTC_STUN_URLS: ['stun:stun.ejemplo.invalid:3478'],
    WEBRTC_TURN_URLS: ['turns:turn.ejemplo.invalid:5349?transport=tcp'],
    WEBRTC_TURN_SECRETO: SECRETO,
    WEBRTC_TURN_TTL_SEGUNDOS: 300,
  });
});

afterAll(async () => {
  await sin.close();
  await con.close();
});

describe('E2 · los STUN/TURN de la vista en vivo (15-Q2)', () => {
  it('sin configurar: la lista VACÍA, como hasta ahora (R1)', async () => {
    const r = await pedir(sin, { rol: 'administrador' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ iceServers: [], ttlSegundos: 600 });
  });

  it('configurados: STUN, y TURN con credencial EFÍMERA de quien la pide; nunca en caché', async () => {
    const r = await pedir(con, {
      rol: 'operador_central',
      copropiedadId: null,
      copropiedades: [COP_A],
      usuarioId: OPERADOR,
    });
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.ttlSegundos).toBe(300);
    expect(r.body.iceServers[0]).toEqual({ urls: ['stun:stun.ejemplo.invalid:3478'] });
    expect(r.body.iceServers[1].urls).toEqual(['turns:turn.ejemplo.invalid:5349?transport=tcp']);
    expect(r.body.iceServers[1].username).toMatch(new RegExp(`^\\d+:${OPERADOR}$`));
    expect(r.body.iceServers[1].credential).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(JSON.stringify(r.body)).not.toContain(SECRETO);
  });

  it('quien no puede ver el video no recibe credencial de TURN', async () => {
    expect((await pedir(con, { rol: 'residente' })).status).toBe(403);
  });

  it('otra copropiedad: fuera del alcance (KPI-36)', async () => {
    expect([403, 404]).toContain((await pedir(con, { rol: 'administrador' }, COP_B)).status);
  });

  it('un TURN sin su secreto no arranca la API; con él, sí', () => {
    const completo = {
      SUPABASE_URL: 'https://ref.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'valor-de-prueba',
      SUPABASE_SECRET_KEY: 'valor-de-prueba',
      SUPABASE_JWKS_URL: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json',
      DATABASE_URL: 'valor-de-prueba',
      DATABASE_POOLER_URL: 'valor-de-prueba',
      CORS_ALLOWED_ORIGINS: 'https://consola.ejemplo.co',
      INGESTA_FIRMA_SECRETO: 'secreto-de-prueba-de-treinta-y-dos-o-mas',
      BIOMETRIA_LLAVE: 'llave-de-prueba-de-treinta-y-dos-o-mas',
      EQUIPOS_LLAVE: 'llave-de-equipos-de-treinta-y-dos-o-mas',
      WEBRTC_TURN_URLS: 'turn:turn.ejemplo.invalid:3478',
    };
    expect(() => cargarConfiguracion(completo)).toThrow(/WEBRTC_TURN_URLS sin WEBRTC_TURN_SECRETO/);
    expect(
      cargarConfiguracion({ ...completo, WEBRTC_TURN_SECRETO: SECRETO }).WEBRTC_TURN_URLS,
    ).toEqual(['turn:turn.ejemplo.invalid:3478']);
  });
});

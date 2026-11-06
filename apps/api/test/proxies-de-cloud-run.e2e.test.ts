import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, crearApp, crearFirmante, sinModoPruebas, tokenDe } from './utilidades';
import { cargarConfiguracion } from '../src/configuracion/esquema';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-154 · DETRÁS DEL FRONTAL DE CLOUD RUN, EL LÍMITE VE LA IP REAL Y NO SE ENGAÑA
 *
 * El frontal de Google AÑADE la IP del cliente al final de `X-Forwarded-For`
 * y conserva, a su izquierda, lo que el cliente haya escrito. Con
 * `API_PROXIES_DE_CONFIANZA=1` la API cree UN salto desde el socket —el
 * frontal— y toma la última entrada. Aquí el socket es el bucle local de
 * supertest y hace de frontal. Cada petición lleva la cabecera como la
 * entregaría Google: `<lo que escribió el cliente>, <IP real>`. IPs de
 * documentación (RFC 5737). Lo que la ruta conteste después (aquí, 503: el
 * padrón sin base) no importa: el límite corre ANTES y es lo que se mide.
 *
 * Por qué NO `loopback`, el valor de sitio: en Cloud Run el socket es el
 * frontal, que no llega desde el bucle local. Con `loopback` la API no creería
 * su cabecera y `req.ip` sería la dirección del frontal: TODOS los clientes en
 * un solo cubo, y el primero que lo agota deja fuera a los demás. Esa dirección
 * no se puede reproducir aquí (supertest sólo habla desde el bucle local); lo
 * comprueba la verificación en la nube con la primera petición real.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const LIMITE = 3;
const CLIENTE = '198.51.100.20';
const OTRO_CLIENTE = '198.51.100.21';
const RUTA = `/copropiedades/${COP_A}/padron/viviendas`;

let app: INestApplication;
let token = '';

beforeAll(async () => {
  const firmante = await crearFirmante();
  app = await crearApp(firmante, undefined, {
    API_PROXIES_DE_CONFIANZA: '1',
    THROTTLE_LIMITE: LIMITE,
    THROTTLE_TTL_SEGUNDOS: 60,
  });
  await sinModoPruebas(app);
  token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
});
afterAll(async () => {
  await app?.close();
});

const desde = (cadena: string) =>
  request(app.getHttpServer())
    .get(RUTA)
    .set('Authorization', `Bearer ${token}`)
    .set('X-Forwarded-For', cadena);

describe('D-154 · API_PROXIES_DE_CONFIANZA=1 detrás del frontal de Google', () => {
  it('falsear la X-Forwarded-For no da un cubo nuevo: el cliente agota SU límite', async () => {
    for (let i = 0; i < LIMITE; i++) {
      // Cada vez una IP «inventada» distinta a la izquierda, como haría quien
      // quiere saltarse el límite; el frontal añade siempre la real al final.
      const r = await desde(`203.0.113.${String(i + 1)}, ${CLIENTE}`);
      expect(r.status, `petición ${String(i + 1)}`).not.toBe(429);
    }
    const agotado = await desde(`203.0.113.99, ${CLIENTE}`);
    expect(agotado.status).toBe(429);
    expect(agotado.headers['retry-after']).toMatch(/^\d+$/);
  });

  it('otro cliente real tiene su propio cubo', async () => {
    const r = await desde(`203.0.113.7, ${OTRO_CLIENTE}`);
    expect(r.status).not.toBe(429);
  });

  it('sin cabecera (nadie delante), cuenta el socket, no un valor inventado', async () => {
    const r = await request(app.getHttpServer()).get(RUTA).set('Authorization', `Bearer ${token}`);
    expect(r.status).not.toBe(429);
  });
});

/**
 * La prueba negativa del valor: con UN salto de más, la API cree lo que el
 * cliente escribió a la izquierda y cada IP inventada estrena cubo. Es lo que
 * pasaría con `2` detrás de un solo frontal, o con «creer a todos».
 */
describe('D-154 · con un salto de más, la cabecera falsa SÍ escaparía del límite', () => {
  let otra: INestApplication;
  let otroToken = '';
  beforeAll(async () => {
    const firmante = await crearFirmante();
    otra = await crearApp(firmante, undefined, {
      API_PROXIES_DE_CONFIANZA: '2',
      THROTTLE_LIMITE: LIMITE,
      THROTTLE_TTL_SEGUNDOS: 60,
    });
    await sinModoPruebas(otra);
    otroToken = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  });
  afterAll(async () => {
    await otra?.close();
  });

  it('el mismo cliente pasa de su límite inventando la IP de la izquierda', async () => {
    for (let i = 0; i < LIMITE + 2; i++) {
      const r = await request(otra.getHttpServer())
        .get(RUTA)
        .set('Authorization', `Bearer ${otroToken}`)
        .set('X-Forwarded-For', `203.0.113.${String(i + 1)}, ${CLIENTE}`);
      expect(r.status, `petición ${String(i + 1)}`).not.toBe(429);
    }
  });
});

describe('D-154 · el valor se valida al arrancar', () => {
  const base = {
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
  };
  it.each(['1', '2', '3', 'loopback', '192.0.2.1, 198.51.100.0/24'])('«%s» se admite', (v) => {
    expect(() => cargarConfiguracion({ ...base, API_PROXIES_DE_CONFIANZA: v })).not.toThrow();
  });
  it.each(['0', '4', '1,loopback', 'todos', 'true'])('«%s» impide el arranque', (v) => {
    expect(() => cargarConfiguracion({ ...base, API_PROXIES_DE_CONFIANZA: v })).toThrow(
      /API_PROXIES_DE_CONFIANZA/,
    );
  });
});

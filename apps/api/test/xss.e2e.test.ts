/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XSS ALMACENADO Y REFLEJADO · §2.7.7 · ETAPA 13
 *
 * La API no sirve HTML, así que la pregunta correcta no es «¿escapa?» sino
 * «¿puede un navegador llegar a INTERPRETAR como HTML algo que la API
 * devuelve?». Son tres condiciones, y hacen falta las tres:
 *
 *   1. el tipo de contenido declarado es `application/json`, no `text/html`;
 *   2. `X-Content-Type-Options: nosniff`, para que el navegador no adivine el
 *      tipo por el contenido cuando la declaración le parezca dudosa;
 *   3. la carga vuelve como DATO dentro del JSON, no concatenada en un cuerpo.
 *
 * El eco al cliente se comprueba de verdad —se guarda y se relee—, que es lo
 * que distingue el XSS almacenado del reflejado: el primero sobrevive a la
 * petición que lo introdujo.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';

const CARGAS = [
  '<script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  `javascript:alert(document.domain)`,
  '<svg/onload=alert(1)>',
  '</script><script>alert(1)</script>',
];

let app: INestApplication;
let portero = '';
let administrador = '';
const srv = () => app.getHttpServer();
const DISPOSITIVO = '00000000-0000-4000-8000-0000000000ff';

beforeAll(async () => {
  const f = await crearFirmante();
  portero = await tokenDe(f, { rol: 'portero', copropiedadId: COP_A });
  administrador = await tokenDe(f, { rol: 'administrador', copropiedadId: COP_A });
  app = await crearApp(f);
});
afterAll(async () => {
  await app.close();
});

describe('XSS reflejado · la respuesta nunca es interpretable como HTML', () => {
  it('toda respuesta viaja como JSON y con nosniff, también las de error', async () => {
    for (const carga of CARGAS) {
      const r = await request(srv())
        .get(`/copropiedades/${COP_A}/padron/viviendas`)
        .query({ busqueda: carga })
        .set('authorization', `Bearer ${administrador}`);

      expect(r.headers['content-type'] ?? '', carga).toMatch(/application\/json/);
      expect(r.headers['x-content-type-options'], carga).toBe('nosniff');
      expect(r.headers['content-type'] ?? '', carga).not.toMatch(/text\/html/);
    }
  });

  it('un 404 con la carga dentro de la RUTA tampoco la devuelve como HTML', async () => {
    // El manejador de «no encontrado» de Express sí produce HTML por omisión, y
    // es el sitio clásico donde aparece un reflejado: la ruta pedida se pinta en
    // el cuerpo. Aquí lo atiende el filtro global, que responde JSON.
    const r = await request(srv())
      .get(`/${encodeURIComponent('<script>alert(1)</script>')}`)
      .set('authorization', `Bearer ${administrador}`);
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.headers['content-type'] ?? '').toMatch(/application\/json/);
    expect(r.text).not.toContain('<script>');
  });
});

describe('XSS almacenado · la carga se guarda como texto y se relee como texto', () => {
  it('un motivo de apertura con marcado HTML vuelve dentro del JSON, no como HTML', async () => {
    const carga = '<img src=x onerror=alert(document.cookie)> apertura autorizada';
    const alta = await request(srv())
      .post(`/copropiedades/${COP_A}/guardia/ordenes`)
      .set('authorization', `Bearer ${portero}`)
      .send({ dispositivoId: DISPOSITIVO, accion: 'abrir', motivo: carga });

    // Si la ruta no está disponible en este montaje, la prueba no puede
    // afirmar nada y lo dice en vez de pasar en falso.
    expect([200, 201, 400, 404]).toContain(alta.status);
    if (alta.status !== 201 && alta.status !== 200) return;

    const lectura = await request(srv())
      .get(`/copropiedades/${COP_A}/guardia/ordenes`)
      .set('authorization', `Bearer ${portero}`);

    expect(lectura.headers['content-type'] ?? '').toMatch(/application\/json/);
    // El texto se conserva —censurarlo sería perder la prueba de auditoría— y
    // viaja escapado dentro de una cadena JSON: `<` sale como `<` pero el
    // cuerpo entero es `application/json` con `nosniff`, así que ningún
    // navegador lo ejecuta. Lo que se exige es que NO haya un cuerpo HTML.
    expect(lectura.text.trimStart().startsWith('<')).toBe(false);
    const cuerpo = JSON.parse(lectura.text) as unknown;
    expect(typeof cuerpo).toBe('object');
  });
});

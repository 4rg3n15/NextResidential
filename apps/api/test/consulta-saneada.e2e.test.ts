/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LA CONSULTA QUE VALIDA EL PIPE ES LA SANEADA · 15-U (Express 5)
 *
 * El saneamiento de §2.7.4 limpia también `req.query`. Con Express 4,
 * `req.query` era una propiedad de la petición: vaciar el objeto y rellenarlo
 * con lo saneado bastaba. Con Express 5 es un GETTER que vuelve a parsear la
 * URL en cada lectura, así que lo que el middleware dejaba en el objeto se
 * perdía y `ValidationPipe` —y el controlador— leían la consulta CRUDA. La
 * prueba unitaria del saneador no lo ve: le pasa un objeto plano.
 *
 * Aquí se prueba por la tubería real, con un campo que sólo valida si llegó
 * saneado: `resultado` admite `permitido` o `negado`. Con espacios y un NUL
 * alrededor, el saneado es `permitido` (200); el crudo no está en la lista
 * (400). Las dos primeras pruebas fijan que el pipe está activo y que el
 * valor limpio pasa: sin ellas, un 200 podría significar que nadie valida.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';

let app: INestApplication;
let administrador = '';
const EVENTOS = `/copropiedades/${COP_A}/eventos`;
// El historial exige su rango; lo que se varía es `resultado`.
const RANGO = 'desde=2026-01-01T00:00:00Z&hasta=2026-01-02T00:00:00Z';

beforeAll(async () => {
  const firmante = await crearFirmante();
  app = await crearApp(firmante);
  administrador = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
});
afterAll(async () => {
  await app?.close();
});

const consultar = (consulta: string) =>
  request(app.getHttpServer())
    .get(`${EVENTOS}?${RANGO}&${consulta}`)
    .set('authorization', `Bearer ${administrador}`);

describe('la consulta llega saneada al ValidationPipe (15-U)', () => {
  it('el pipe valida la consulta: un valor fuera de la lista es 400', async () => {
    expect((await consultar('resultado=otro')).status).toBe(400);
  });

  it('el valor limpio pasa', async () => {
    expect((await consultar('resultado=permitido')).status).toBe(200);
  });

  it('con espacios y un NUL alrededor, lo que valida el pipe es lo saneado', async () => {
    const r = await consultar('resultado=%20permitido%00%20');
    expect(r.status).toBe(200);
  });
});

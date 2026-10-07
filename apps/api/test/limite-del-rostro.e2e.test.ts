import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, sinModoPruebas, tokenDe } from './utilidades';
import { USUARIO_R1 } from './dobles/directorio-del-residente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · LAS RUTAS DEL ROSTRO, 10 POR MINUTO POR IP (§2.7.5)
 *
 * La undécima petición desde la misma dirección recibe 429 con `Retry-After`;
 * desde otra dirección, la misma cuenta sigue. El tope de 5 capturas en 24 h
 * por cuenta es otro, y se cuenta en la base (`rostro-del-residente-pg`).
 *
 * Sin base: el limitador corre antes que el caso de uso. Con el modo pruebas
 * APAGADO por el camino de producción, porque con él los topes suben (H5).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const LIMITE = 10;
let app: INestApplication;
let token = '';
beforeAll(async () => {
  const firmante = await crearFirmante();
  app = await crearApp(firmante);
  await sinModoPruebas(app);
  token = await tokenDe(firmante, {
    rol: 'residente',
    copropiedadId: COP_A,
    usuarioId: USUARIO_R1,
    aal: 'aal1',
  });
});
afterAll(async () => {
  await app?.close();
});

const leer = (ip: string) =>
  request(app.getHttpServer())
    .get(`/copropiedades/${COP_A}/mi/rostro`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-forwarded-for', ip);

describe('15-X · D2 · el límite por IP de «Mi rostro»', () => {
  it(`la petición ${String(LIMITE + 1)} desde la misma IP: 429 con Retry-After`, async () => {
    const vistos: number[] = [];
    for (let i = 0; i < LIMITE; i += 1) vistos.push((await leer('192.0.2.40')).status);
    // Las diez primeras, atendidas de verdad: no basta con que no sean 429.
    expect(vistos).toEqual(Array.from({ length: LIMITE }, () => 200));
    const limitada = await leer('192.0.2.40');
    expect(limitada.status).toBe(429);
    expect(Number(limitada.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('la misma cuenta desde otra IP sigue', async () => {
    expect((await leer('192.0.2.41')).status).toBe(200);
  });
});

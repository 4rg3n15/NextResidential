/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LÍMITE DE PETICIONES BAJO CARGA · §2.7.5 · ETAPA 13
 *
 * El alcance de la etapa pide dos cosas que nunca se habían medido juntas:
 * «rate limiting bajo carga» y «verificación de que el backoff del Edge no lo
 * dispara». Lo que ya existía era la prueba de carga de la ingesta (D-28), que
 * mide el limitador POR DISPOSITIVO; aquí se mide el límite general por IP, la
 * respuesta 429 con `Retry-After`, y el endurecimiento por ruta sensible.
 *
 * La app se monta con un límite BAJO a propósito: `configuracionDePrueba` usa
 * 100 000 porque en el resto de la suite el limitador solo estorbaría, y con
 * ese valor esta comprobación sería imposible de distinguir de «no hay límite».
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import { esperaDelIntento } from '../../edge/src/aplicacion/reconciliacion';

const LIMITE = 12;

let app: INestApplication;
let administrador = '';
const srv = () => app.getHttpServer();

beforeAll(async () => {
  const f = await crearFirmante();
  administrador = await tokenDe(f, { rol: 'administrador', copropiedadId: COP_A });
  app = await crearApp(f, undefined, { THROTTLE_LIMITE: LIMITE, THROTTLE_TTL_SEGUNDOS: 60 });
});
afterAll(async () => {
  await app.close();
});

describe('§2.7.5 · el límite general se aplica y se anuncia', () => {
  it(`la petición ${LIMITE + 1} recibe 429 con Retry-After`, async () => {
    const estados: number[] = [];
    let retryAfter: string | undefined;
    for (let i = 0; i < LIMITE + 4; i += 1) {
      const r = await request(srv())
        .get(`/copropiedades/${COP_A}/padron/viviendas`)
        .set('authorization', `Bearer ${administrador}`);
      estados.push(r.status);
      if (r.status === 429 && retryAfter === undefined) {
        retryAfter = r.headers['retry-after'] as string | undefined;
      }
    }

    const permitidas = estados.filter((e) => e !== 429).length;
    const rechazadas = estados.filter((e) => e === 429).length;

    expect(permitidas).toBe(LIMITE);
    expect(rechazadas).toBe(4);
    // Sin `Retry-After` el cliente no sabe cuándo volver y reintenta a ciegas,
    // que es exactamente lo que el limitador quiere evitar (§2.7.5).
    expect(retryAfter).toBeDefined();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it('y el 429 no filtra nada del interior', async () => {
    const r = await request(srv())
      .get(`/copropiedades/${COP_A}/padron/viviendas`)
      .set('authorization', `Bearer ${administrador}`);
    expect(r.status).toBe(429);
    expect(JSON.stringify(r.body)).not.toMatch(/throttle|storage|ttl|tracker/i);
  });
});

describe('§2.7.5 · el retroceso del Edge no choca con el limitador', () => {
  it('la primera espera nunca es cero, y crece de forma exponencial acotada', () => {
    const BASE = 1000; // RECONCILIACION_BACKOFF_MS por omisión
    const minimo = (i: number) => esperaDelIntento(i, BASE, () => 0);
    const maximo = (i: number) => esperaDelIntento(i, BASE, () => 1);

    // El jitter RESTA, nunca suma: entre el 50 % y el 100 % del nominal. Si
    // sumara, el tope dejaría de ser un tope y una cola larga esperaría más de
    // lo previsto sin que nadie lo hubiera pedido.
    expect(minimo(1)).toBe(500);
    expect(maximo(1)).toBe(1000);
    expect(minimo(4)).toBe(4000);
    expect(maximo(4)).toBe(8000);

    // Y hay techo: sin él, un Edge desconectado una noche despertaría con una
    // espera de días.
    expect(maximo(50)).toBe(5 * 60_000);

    // Lo que importa para §2.7.5: entre dos intentos consecutivos del MISMO
    // envío siempre pasa al menos medio segundo, así que un solo Edge no puede
    // agotar por sí mismo un límite de 120 por minuto ni siquiera en el peor
    // caso (120 intentos × 500 ms = 60 s justos).
    for (let i = 1; i <= 10; i += 1) expect(minimo(i)).toBeGreaterThanOrEqual(500);
  });
});

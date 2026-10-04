import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { ReglasDeIpEnMemoria } from '../src/plataforma';
import { COP_A, crearApp, crearFirmante, sinModoPruebas, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import {
  CABECERA_FIRMA_DE_IP,
  CABECERA_IP_DEL_CLIENTE,
  firmaDeIp,
  ipFirmadaValida,
} from '../src/comun/ip-firmada';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · D4 · CON LA CONSOLA EN NETLIFY, LA IP DEL PORTERO NO SE PUEDE FINGIR
 *
 * El proxy de la consola sale por direcciones que la API no conoce, así que su
 * `X-Forwarded-For` NO se cree (aquí, `API_PROXIES_DE_CONFIANZA` no incluye el
 * bucle local desde el que habla la prueba). La IP del navegador sólo cuenta si
 * llega FIRMADA con el secreto compartido. Se prueba con la lista blanca real
 * de porteros y el modo pruebas apagado: la portería admite 192.0.2.10.
 * IPs de documentación (RFC 5737).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SECRETO = 'secreto-compartido-de-prueba-15r-d4-firma';
const IP_DE_LA_PORTERIA = '192.0.2.10';
const RUTA = `/copropiedades/${COP_A}/guardia/cola`;
const ahoraS = (): number => Math.floor(Date.now() / 1000);

let app: INestApplication;
let firmante: Firmante;
let portero = '';

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante, undefined, {
    API_PROXIES_DE_CONFIANZA: '192.0.2.250',
    API_IP_FIRMA_SECRETO: SECRETO,
  });
  app.get(ReglasDeIpEnMemoria).fijar(COP_A, { ipsPorteria: [IP_DE_LA_PORTERIA], ipsRemotas: [] });
  await sinModoPruebas(app);
  portero = await tokenDe(firmante, { rol: 'portero', copropiedadId: COP_A });
});
afterAll(async () => {
  await app?.close();
});

const pedir = (cabeceras: Record<string, string>) => {
  let r = request(app.getHttpServer()).get(RUTA).set('Authorization', `Bearer ${portero}`);
  for (const [k, v] of Object.entries(cabeceras)) r = r.set(k, v);
  return r;
};

describe('D4 · la firma es la misma en la consola y en la API', () => {
  it('vector fijo, compartido con `apps/web/src/lib/ip-firmada.test.ts`', () => {
    expect(firmaDeIp(SECRETO, IP_DE_LA_PORTERIA, 1_790_000_000)).toBe(
      '1790000000.ojwZULrxXc-fBVcYk-4J1ByFBgtK_ajk3j31pPG0saE',
    );
  });

  it('rechaza firma vieja, del futuro, de otra IP, sin número o con algo que no es IP', () => {
    const t = 1_790_000_000;
    const firma = firmaDeIp(SECRETO, IP_DE_LA_PORTERIA, t);
    expect(ipFirmadaValida(SECRETO, IP_DE_LA_PORTERIA, firma, t + 60)).toBe(true);
    expect(ipFirmadaValida(SECRETO, IP_DE_LA_PORTERIA, firma, t + 61)).toBe(false);
    expect(ipFirmadaValida(SECRETO, IP_DE_LA_PORTERIA, firma, t - 61)).toBe(false);
    expect(ipFirmadaValida(SECRETO, '192.0.2.11', firma, t)).toBe(false);
    expect(ipFirmadaValida(SECRETO, IP_DE_LA_PORTERIA, firma.split('.')[1] ?? '', t)).toBe(false);
    const deTexto = firmaDeIp(SECRETO, 'no-es-ip', t);
    expect(ipFirmadaValida(SECRETO, 'no-es-ip', deTexto, t)).toBe(false);
  });
});

describe('D4 · la lista blanca de porteros por HTTP', () => {
  it('con la IP en X-Forwarded-For de un proxy NO declarado: 403', async () => {
    await pedir({ 'X-Forwarded-For': IP_DE_LA_PORTERIA }).expect(403);
  });

  it('con la IP declarada pero SIN firma: 403', async () => {
    await pedir({ [CABECERA_IP_DEL_CLIENTE]: IP_DE_LA_PORTERIA }).expect(403);
  });

  it('con la IP FIRMADA por la consola: entra', async () => {
    const r = await pedir({
      [CABECERA_IP_DEL_CLIENTE]: IP_DE_LA_PORTERIA,
      [CABECERA_FIRMA_DE_IP]: firmaDeIp(SECRETO, IP_DE_LA_PORTERIA, ahoraS()),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
  });

  it('firmada con OTRO secreto (lo que puede hacer el navegador): 403', async () => {
    await pedir({
      [CABECERA_IP_DEL_CLIENTE]: IP_DE_LA_PORTERIA,
      [CABECERA_FIRMA_DE_IP]: firmaDeIp(
        'otro-secreto-que-el-navegador-se-invento',
        IP_DE_LA_PORTERIA,
        ahoraS(),
      ),
    }).expect(403);
  });

  it('una firma vieja reutilizada (más de 60 s): 403', async () => {
    await pedir({
      [CABECERA_IP_DEL_CLIENTE]: IP_DE_LA_PORTERIA,
      [CABECERA_FIRMA_DE_IP]: firmaDeIp(SECRETO, IP_DE_LA_PORTERIA, ahoraS() - 120),
    }).expect(403);
  });

  it('la firma de otra IP con la IP de la portería pegada encima: 403', async () => {
    await pedir({
      [CABECERA_IP_DEL_CLIENTE]: IP_DE_LA_PORTERIA,
      [CABECERA_FIRMA_DE_IP]: firmaDeIp(SECRETO, '203.0.113.9', ahoraS()),
    }).expect(403);
  });
});

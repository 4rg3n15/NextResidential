/**
 * ═══════════════════════════════════════════════════════════════════════════
 * D-150 · UN CUERPO COMPRIMIDO NO LLEGA AL DESCOMPRESOR
 *
 * CVE-2026-111497 (boletín de Node del 21/10/2026) es una escritura fuera de
 * límites en el descompresor Brotli de `node:zlib`. `body-parser` descomprime
 * por omisión, y los parsers corren ANTES de cualquier guard: cualquiera en
 * internet llegaba al descompresor con un POST sin autenticar. Medido antes de
 * esta corrección: `express.json()` devolvía el objeto de un cuerpo `br`.
 *
 * Ahora ningún parser de `montarTuberiaHttp` descomprime. Se recorre la MISMA
 * tubería que el despliegue (`crearApp` → `montarTuberiaHttp`), parser por
 * parser y codificación por codificación: el 415 tiene que salir del parser, no
 * de un guard que casualmente corra antes.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { crearApp, crearFirmante } from './utilidades';

const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = '20000000-0000-4000-8000-000000000001';

const COMPRESORES = {
  br: brotliCompressSync,
  gzip: gzipSync,
  deflate: deflateSync,
} as const;

/** Cada parser de la tubería, con una ruta suya y un cuerpo de su tipo. */
const PARSERS = [
  {
    parser: 'json general',
    ruta: '/auth/mfa/recuperacion',
    tipo: 'application/json',
    cuerpo: '{"codigo":"x"}',
  },
  {
    parser: 'json de la fotografía',
    ruta: `/copropiedades/${COP}/autorizaciones/${EQUIPO}/fotografia`,
    tipo: 'application/json',
    cuerpo: '{"contenidoBase64":"x"}',
  },
  {
    parser: 'urlencoded',
    ruta: '/auth/mfa/recuperacion',
    tipo: 'application/x-www-form-urlencoded',
    cuerpo: 'codigo=x',
  },
  {
    parser: 'raw del audio',
    ruta: `/copropiedades/${COP}/guardia/intercom/${EQUIPO}/audio`,
    tipo: 'application/octet-stream',
    cuerpo: 'audio',
  },
  {
    parser: 'text del SDP',
    ruta: `/copropiedades/${COP}/guardia/video/${EQUIPO}/whep`,
    tipo: 'application/sdp',
    cuerpo: 'v=0\r\n',
  },
] as const;

let app: INestApplication;
const srv = () => app.getHttpServer();

beforeAll(async () => {
  app = await crearApp(await crearFirmante());
});
afterAll(async () => {
  await app.close();
});

describe('D-150 · ningún parser descomprime', () => {
  for (const { parser, ruta, tipo, cuerpo } of PARSERS) {
    for (const [codificacion, comprimir] of Object.entries(COMPRESORES)) {
      it(`${parser} · Content-Encoding: ${codificacion} → 415, sin autenticar`, async () => {
        const r = await request(srv())
          .post(ruta)
          .set('Content-Type', tipo)
          .set('Content-Encoding', codificacion)
          .send(comprimir(Buffer.from(cuerpo)));
        expect(r.status).toBe(415);
        expect(r.body).toMatchObject({ estado: 415 });
      });
    }
  }

  it('el mismo cuerpo SIN comprimir pasa el parser: lo que responde es la ruta, no un 415', async () => {
    for (const { parser, ruta, tipo, cuerpo } of PARSERS) {
      const r = await request(srv()).post(ruta).set('Content-Type', tipo).send(cuerpo);
      expect(r.status, parser).not.toBe(415);
    }
  });

  it('`Content-Encoding: identity` no es compresión: pasa el parser', async () => {
    const r = await request(srv())
      .post('/auth/mfa/recuperacion')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'identity')
      .send('{"codigo":"x"}');
    expect(r.status).not.toBe(415);
  });

  it('`main.ts` arranca sin los parsers de Nest, que sí descomprimen', () => {
    // El banco ya arranca con `bodyParser: false`; el despliegue, desde D-150, también.
    const main = readFileSync(resolve(__dirname, '../src/main.ts'), 'utf8');
    const desde = main.indexOf('NestFactory.create');
    const opciones = main.slice(desde, main.indexOf('});', desde));
    expect(desde).toBeGreaterThan(-1);
    expect(opciones).toMatch(/bodyParser:\s*false/);
  });
});

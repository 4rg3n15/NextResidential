/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CORS, CSP Y CABECERAS · §2.7.2 y §2.7.7 · ETAPA 13 · H-13-11
 *
 * Esta suite existe porque hasta la ETAPA 13 NO EXISTÍA, y su ausencia no se
 * veía: `src/seguridad.ts` tenía **0 % de cobertura** con 656 pruebas en verde.
 * El fixture de pruebas reconstruía su propio `ValidationPipe` y nunca llamaba
 * a `aplicarSeguridad`, así que ni la lista blanca de CORS, ni la CSP, ni HSTS
 * se ejercitaban. Cambiar `origin:` por `true` no ponía nada en rojo.
 *
 * Se verifica POR ORIGEN, POR MÉTODO Y POR CABECERA, que es lo que pide el
 * alcance de la etapa — no «que CORS esté configurado».
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { configuracionDePrueba, crearApp, crearFirmante } from './utilidades';

const PERMITIDO = 'https://consola.invalid';
const AJENO = 'https://atacante.invalid';

let app: INestApplication;
const srv = () => app.getHttpServer();

beforeAll(async () => {
  app = await crearApp(await crearFirmante());
});
afterAll(async () => {
  await app.close();
});

describe('CORS · por origen (§2.7.2)', () => {
  it('el origen de la lista blanca se devuelve LITERAL, nunca reflejado a ciegas', async () => {
    expect(configuracionDePrueba.origenesPermitidos).toContain(PERMITIDO);
    const r = await request(srv()).get('/health').set('Origin', PERMITIDO);
    expect(r.headers['access-control-allow-origin']).toBe(PERMITIDO);
    expect(r.headers['access-control-allow-credentials']).toBe('true');
  });

  it('un origen AJENO no recibe cabeceras CORS — y tampoco un 500', async () => {
    // Denegar emitiendo 500 convertiría un rechazo correcto en ruido de
    // incidentes: el navegador ya bloquea la respuesta sin la cabecera.
    const r = await request(srv()).get('/health').set('Origin', AJENO);
    expect(r.status).toBe(200);
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('el subdominio y el prefijo del origen permitido NO cuelan', async () => {
    for (const origen of [
      'https://consola.invalid.atacante.invalid',
      'https://malaconsola.invalid',
      'http://consola.invalid',
      'https://consola.invalid:8443',
    ]) {
      const r = await request(srv()).get('/health').set('Origin', origen);
      expect(r.headers['access-control-allow-origin'], origen).toBeUndefined();
    }
  });
});

describe('CORS · por método y por cabecera', () => {
  it('el preflight de un origen permitido enumera métodos y cabeceras, sin comodín', async () => {
    const r = await request(srv())
      .options('/health')
      .set('Origin', PERMITIDO)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    const metodos = (r.headers['access-control-allow-methods'] ?? '').split(',');
    const cabeceras = (r.headers['access-control-allow-headers'] ?? '').split(',');

    expect(metodos).not.toContain('*');
    expect(cabeceras).not.toContain('*');
    expect(metodos).toEqual(expect.arrayContaining(['GET', 'POST', 'PATCH', 'OPTIONS']));
    // PUT nunca: la API no expone ni una ruta con ese verbo.
    expect(metodos).not.toContain('PUT');
    expect(cabeceras.map((c) => c.toLowerCase())).toEqual(
      expect.arrayContaining(['content-type', 'authorization', 'x-request-id']),
    );
    // Una cabecera no declarada no aparece por el hecho de pedirla.
    expect(cabeceras.map((c) => c.toLowerCase())).not.toContain('x-api-key');
  });

  it('el preflight de un origen AJENO no autoriza nada', async () => {
    const r = await request(srv())
      .options('/health')
      .set('Origin', AJENO)
      .set('Access-Control-Request-Method', 'POST');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    expect(r.headers['access-control-allow-methods']).toBeUndefined();
  });

  it('expone x-request-id para que la consola pueda correlacionar el incidente', async () => {
    // Sin `Access-Control-Expose-Headers`, sólo son legibles las siete cabeceras
    // seguras por omisión: la consola —que vive en otro origen por diseño— no
    // podía leer el identificador de correlación que el interceptor ya genera.
    const r = await request(srv()).get('/health').set('Origin', PERMITIDO);
    expect((r.headers['access-control-expose-headers'] ?? '').toLowerCase()).toContain(
      'x-request-id',
    );
  });
});

describe('Cabeceras de endurecimiento (§2.7.7)', () => {
  it('CSP sin unsafe-inline ni unsafe-eval, con object-src y frame-ancestors cerrados', async () => {
    const r = await request(srv()).get('/health');
    const csp = r.headers['content-security-policy'] ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('HSTS, nosniff y Referrer-Policy', async () => {
    const r = await request(srv()).get('/health');
    expect(r.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(r.headers['strict-transport-security']).toContain('includeSubDomains');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('no anuncia el motor: sin x-powered-by', async () => {
    const r = await request(srv()).get('/health');
    expect(r.headers['x-powered-by']).toBeUndefined();
  });
});

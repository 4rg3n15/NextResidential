import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { crearApp, crearFirmante, tokenDe, COP_A } from './utilidades';
import type { Firmante } from './utilidades';
import { METRICAS } from '../src/observabilidad';
import type { Metricas } from '../src/observabilidad';

/**
 * El tablero de latencias comprometidas (RNF-11.3, ETAPA 14) y la correlación
 * de petición, comprobados por el camino que se despliega: HTTP real contra la
 * aplicación montada como en `main.ts`.
 */
let app: INestApplication;
let firmante: Firmante;

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
});
afterAll(async () => {
  await app?.close();
});

const admin = () => tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });

describe('GET /observabilidad/latencias', () => {
  it('sin token, 401 como cualquier otra', async () => {
    await request(app.getHttpServer()).get('/observabilidad/latencias').expect(401);
  });

  it('un residente no lo ve: es información de operación', async () => {
    const token = await tokenDe(firmante, { rol: 'residente', copropiedadId: COP_A });
    await request(app.getHttpServer())
      .get('/observabilidad/latencias')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('devuelve LOS CINCO indicadores, con su tramo y lo que NO miden', async () => {
    const res = await request(app.getHttpServer())
      .get('/observabilidad/latencias')
      .set('Authorization', `Bearer ${await admin()}`)
      .expect(200);

    const claves = (res.body.filas as { definicion: { clave: string } }[]).map(
      (f) => f.definicion.clave,
    );
    expect(claves).toEqual(['KPI-09', 'KPI-13', 'KPI-25', 'KPI-32', 'KPI-33']);
    for (const fila of res.body.filas as { definicion: Record<string, unknown> }[]) {
      // La cifra y su tramo viajan juntos a propósito: una latencia sin tramo
      // no demuestra nada, y separarlos es cómo un tablero verde se lee mal.
      expect(String(fila.definicion.segmento).length).toBeGreaterThan(20);
      expect(String(fila.definicion.noIncluye).length).toBeGreaterThan(20);
      expect(Number(fila.definicion.umbralMs)).toBeGreaterThan(0);
    }
    expect(res.body.porProceso).toBe(true);
  });

  it('`cumple` es null sin muestras, y eso no es «cumple»', async () => {
    const metricas = app.get<Metricas>(METRICAS);
    (metricas as unknown as { reiniciar(): void }).reiniciar();
    const res = await request(app.getHttpServer())
      .get('/observabilidad/latencias')
      .set('Authorization', `Bearer ${await admin()}`)
      .expect(200);
    for (const fila of res.body.filas as { cumple: boolean | null }[]) {
      expect(fila.cumple).toBeNull();
    }
  });

  it('una ruta marcada con @MideKpi deja muestra AUNQUE la petición falle', async () => {
    /**
     * Se ejerce la orden manual con un cuerpo inválido: responde 4xx y aun así
     * el cronómetro tiene que haber anotado. Medir solo el camino feliz es cómo
     * un p99 sale bonito mientras el servicio se está cayendo.
     */
    const metricas = app.get<Metricas>(METRICAS);
    (metricas as unknown as { reiniciar(): void }).reiniciar();

    const antes = metricas.resumen().filas.find((f) => f.definicion.clave === 'KPI-32')!;
    expect(antes.observadas).toBe(0);

    await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/guardia/ordenes`)
      .set('Authorization', `Bearer ${await admin()}`)
      .send({ sin: 'sentido' });

    const despues = metricas.resumen().filas.find((f) => f.definicion.clave === 'KPI-32')!;
    expect(despues.observadas).toBe(1);
  });

  it('una ruta SIN @MideKpi no ensucia ningún indicador', async () => {
    const metricas = app.get<Metricas>(METRICAS);
    (metricas as unknown as { reiniciar(): void }).reiniciar();
    await request(app.getHttpServer()).get('/health').expect(200);
    const total = metricas.resumen().filas.reduce((a, f) => a + f.observadas, 0);
    expect(total).toBe(0);
  });
});

describe('correlación de petición', () => {
  it('la respuesta devuelve un `x-request-id` aunque no se envíe', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('respeta el identificador entrante: la traza atraviesa consola, API y Edge', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'traza-de-la-consola.7')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('traza-de-la-consola.7');
  });

  it('un identificador que partiría una línea de log se DESCARTA', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('x-request-id', 'abc"},{"nivel":"info","mensaje":"inyectado')
      .expect(200);
    expect(res.headers['x-request-id']).not.toContain('inyectado');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, enumerarRutas, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { REPOSITORIO_TABLERO } from '../src/tablero';
import type { RepositorioTableroEnMemoria } from '../src/tablero/infraestructura/repositorio-tablero-en-memoria';

/**
 * Tablero operativo (W-02) — HU-38.
 *
 * Lo que esta suite protege, además de la forma de la respuesta:
 *
 *  - **`credencial_ref` no sale de la API por ninguna ruta** (RN-21). Se busca
 *    la cadena en el cuerpo COMPLETO serializado, no campo a campo: un mapeo
 *    que la deje pasar dentro de un objeto anidado no se vería inspeccionando
 *    las claves que uno recuerda.
 *  - **El estado del dispositivo se deriva del latido**, no de una columna.
 *  - **Las tres rutas nuevas entran solas en el recorrido de aislamiento.**
 */
let app: INestApplication;
let firmante: Firmante;
let repo: RepositorioTableroEnMemoria;

const CREDENCIAL = 'vault:equipos/porteria-principal';

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  repo = app.get<RepositorioTableroEnMemoria>(REPOSITORIO_TABLERO);

  repo.declararPadron(COP_A, {
    residentesActivos: 247,
    residentesAltaEnVentana: 4,
    vehiculosActivos: 183,
    vehiculosAltaEnVentana: 12,
  });
  repo.declararVisitantes(COP_A, { autorizacionesDelDia: 34, dentroAhora: 8 });
  repo.declararDispositivo(COP_A, {
    id: '20000000-0000-4000-8000-000000000001',
    nombre: 'Cámara de placas · portería principal',
    tipo: 'camara_lpr',
    zonaId: null,
    host: 'lpr-porteria.invalid',
    puerto: 80,
    modelo: 'modelo-de-prueba',
    firmware: 'v0.0.0-prueba',
    ultimoLatido: null,
    ultimaSincronizacion: null,
  });
});
afterAll(async () => {
  await app?.close();
});

const comoAdmin = async (): Promise<string> =>
  tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });

describe('GET /copropiedades/:id/tablero/indicadores', () => {
  it('devuelve las cuatro tarjetas del mockup', async () => {
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/tablero/indicadores`)
      .set('Authorization', `Bearer ${await comoAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body.padron).toMatchObject({ residentesActivos: 247, vehiculosActivos: 183 });
    expect(res.body.visitantes).toMatchObject({ autorizacionesDelDia: 34, dentroAhora: 8 });
    expect(res.body.alertas).toHaveProperty('pendientes');
  });

  it('declara la zona horaria con la que calculó «hoy»', async () => {
    // Sin este dato la consola no puede decir a qué día se refiere el número, y
    // acabaría re-interpretándolo con la zona del navegador.
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/tablero/indicadores`)
      .set('Authorization', `Bearer ${await comoAdmin()}`);
    expect(res.body.ventana.zonaHoraria).toBe('America/Bogota');
    expect(Date.parse(res.body.ventana.desde)).not.toBeNaN();
    expect(Date.parse(res.body.ventana.hasta)).toBeGreaterThan(Date.parse(res.body.ventana.desde));
  });

  it('un residente no alcanza el tablero de administración', async () => {
    const token = await tokenDe(firmante, { rol: 'residente', copropiedadId: COP_A });
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/tablero/indicadores`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /copropiedades/:id/tablero/accesos-por-hora', () => {
  it('devuelve 24 franjas con el eje fijado por el servidor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/tablero/accesos-por-hora`)
      .set('Authorization', `Bearer ${await comoAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body.franjas).toHaveLength(24);
    expect(res.body.franjas.map((f: { hora: number }) => f.hora)).toEqual([...Array(24).keys()]);
    expect(res.body.zonaHoraria).toBe('America/Bogota');
  });
});

describe('GET /copropiedades/:id/tablero/dispositivos', () => {
  it('un equipo que nunca latió aparece como caído, no como en línea', async () => {
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/tablero/dispositivos`)
      .set('Authorization', `Bearer ${await comoAdmin()}`);
    expect(res.status).toBe(200);
    expect(res.body.dispositivos[0]).toMatchObject({ estado: 'caido', ultimoLatido: null });
    expect(res.body).toMatchObject({ saludables: 0, caidos: 1 });
  });

  it('el rol administrativo ve el direccionamiento del equipo (C-11)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/tablero/dispositivos`)
      .set('Authorization', `Bearer ${await comoAdmin()}`);
    expect(res.body.dispositivos[0]).toMatchObject({
      host: 'lpr-porteria.invalid',
      puerto: 80,
      firmware: 'v0.0.0-prueba',
    });
  });

  it('RN-21 · la credencial del dispositivo NO sale por la API, ni enmascarada', async () => {
    // La sonda se planta en el adaptador: si algún día alguien añade el campo a
    // la proyección «porque hace falta para diagnosticar», esto se pone rojo.
    repo.declararDispositivo(COP_A, {
      id: '20000000-0000-4000-8000-000000000002',
      nombre: 'Terminal Facial Peatonal',
      tipo: 'terminal_facial',
      zonaId: null,
      host: 'facial-peatonal.invalid',
      puerto: 80,
      modelo: 'modelo-de-prueba-2',
      firmware: 'v0.0.0-prueba-2',
      ultimoLatido: new Date(),
      ultimaSincronizacion: null,
      // @ts-expect-error el puerto NO tiene este campo: se inyecta a la fuerza
      // para comprobar que la presentación no lo reenvía por copia de objeto.
      credencialRef: CREDENCIAL,
    });

    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/tablero/dispositivos`)
      .set('Authorization', `Bearer ${await comoAdmin()}`);

    const cuerpo = JSON.stringify(res.body);
    expect(cuerpo).not.toContain(CREDENCIAL);
    expect(cuerpo).not.toContain('vault:');
    expect(cuerpo).not.toContain('credencial');
  });
});

describe('cobertura de la ETAPA 09-A', () => {
  it('las tres rutas del tablero entraron solas en la enumeración del enrutador', () => {
    // Es lo que hace que la suite de aislamiento las recorra sin que nadie las
    // añada a mano: si esto falla, hay endpoints fuera del recorrido de fuga.
    const tablero = enumerarRutas(app).filter((r) => r.ruta.includes('/tablero/'));
    expect(tablero.map((r) => `${r.metodo} ${r.ruta}`).sort()).toEqual([
      'GET /copropiedades/:id/tablero/accesos-por-hora',
      'GET /copropiedades/:id/tablero/dispositivos',
      'GET /copropiedades/:id/tablero/indicadores',
    ]);
  });

  it('el tablero de otra copropiedad responde 404, no 403 ni datos', async () => {
    const token = await comoAdmin();
    for (const ruta of ['indicadores', 'accesos-por-hora', 'dispositivos']) {
      const res = await request(app.getHttpServer())
        .get(`/copropiedades/${COP_B}/tablero/${ruta}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status, ruta).toBe(404);
    }
  });
});

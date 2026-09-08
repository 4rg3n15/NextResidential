import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import {
  COP_A,
  COP_B,
  configuracionDePrueba,
  crearApp,
  crearFirmante,
  tokenDe,
} from './utilidades';
import type { Firmante } from './utilidades';
import {
  CABECERA_FIRMA,
  CABECERA_MARCA,
  firmar,
} from '../src/autorizaciones/presentacion/firma-ingesta';

/**
 * Camino completo de la ETAPA 06, por HTTP y contra la aplicación real:
 * ingesta firmada → decisión → evento inmutable → alerta escalada → consulta →
 * exportación → flujo en vivo.
 *
 * Se prueba aquí y no solo en unitarias porque lo que cierra D-27 es que el
 * endpoint **persista de verdad**, y eso solo se ve atravesando la tubería
 * entera: guards, validación, cableado del módulo y controladores.
 */
describe('eventos · camino completo por HTTP', () => {
  let app: INestApplication;
  let firmante: Firmante;
  let token: string;

  const HOY = new Date();
  const rango = {
    desde: new Date(HOY.getTime() - 3_600_000).toISOString(),
    hasta: new Date(HOY.getTime() + 3_600_000).toISOString(),
  };

  let contador = 0;
  const evento = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    copropiedadId: COP_A,
    dispositivoId: `disp-${(contador += 1)}`,
    metodo: 'placa',
    placaLeida: 'ABC123',
    confianzaCentesimas: 95,
    referenciaExterna: `ev-${contador}`,
    ...extra,
  });

  const firmado = (cuerpo: object): Record<string, string> => {
    const marca = String(Math.floor(Date.now() / 1000));
    const crudo = JSON.stringify(cuerpo);
    return {
      [CABECERA_MARCA]: marca,
      [CABECERA_FIRMA]: firmar(configuracionDePrueba.INGESTA_FIRMA_SECRETO, marca, crudo),
      'content-type': 'application/json',
    };
  };

  const ingerir = (cuerpo: object, ruta = '/ingesta/eventos') =>
    request(app.getHttpServer()).post(ruta).set(firmado(cuerpo)).send(cuerpo);

  beforeAll(async () => {
    firmante = await crearFirmante();
    app = await crearApp(firmante);
    token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  });
  afterAll(async () => {
    await app.close();
  });

  it('D-27 cerrada · la ingesta ya no solo acredita: decide y registra', async () => {
    const cuerpo = evento();
    const r = await ingerir(cuerpo).expect(202);

    expect(r.body.aceptado).toBe(true);
    expect(r.body.eventoId).toBeTypeOf('string');
    expect(r.body.duplicado).toBe(false);
    expect(r.body.claveIdempotencia).toContain(String(cuerpo['dispositivoId']));
  });

  it('sin adaptador de padrón, la decisión es DENEGAR (§2.1.4, D-25)', async () => {
    // El cargador conservador no puede resolver el contexto, así que el motor
    // niega. Es el comportamiento exigido, no una carencia disimulada.
    const r = await ingerir(evento()).expect(202);
    expect(r.body.permitido).toBe(false);
  });

  it('esa negación se escala a un humano en vez de quedarse callada (P-07)', async () => {
    const r = await ingerir(evento()).expect(202);
    expect(r.body.alertaId).toBeTypeOf('string');
  });

  it('CA-22 · el reintento del mismo hecho devuelve 202 y `duplicado: true`', async () => {
    const cuerpo = evento();
    const primero = await ingerir(cuerpo).expect(202);
    const segundo = await ingerir(cuerpo).expect(202);

    expect(segundo.body.duplicado).toBe(true);
    expect(segundo.body.eventoId).toBe(primero.body.eventoId);
  });

  it('el evento aparece en el historial (HU-32)', async () => {
    const cuerpo = evento();
    const ingesta = await ingerir(cuerpo).expect(202);

    const r = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/eventos`)
      .query(rango)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(r.body.filas.some((f: { id: string }) => f.id === ingesta.body.eventoId)).toBe(true);
  });

  it('el historial exige rango: sin él, 400 y no una consulta sin techo', async () => {
    await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/eventos`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('la alerta aparece en la cola del operador, con su KPI-25 medido', async () => {
    await ingerir(evento()).expect(202);

    const r = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/alertas`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(r.body.length).toBeGreaterThan(0);
    // Sin operador conectado al flujo, el escalamiento no cuenta como cumplido.
    expect(r.body[0].escaladaEn).not.toBeNull();
    expect(r.body[0]).toHaveProperty('escaladaDentroDelPlazo');
  });

  it('atender y resolver una alerta deja constancia del operador y del motivo', async () => {
    const ingesta = await ingerir(evento()).expect(202);
    const alertaId = ingesta.body.alertaId;

    const atendida = await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/alertas/${alertaId}/atencion`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(atendida.body.estado).toBe('en_atencion');

    await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/alertas/${alertaId}/resolucion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notas: 'verificado en cámara, sin novedad' })
      .expect(201);
  });

  it('resolver sin notas: 400 (no se cierra una alerta sin decir por qué)', async () => {
    const ingesta = await ingerir(evento()).expect(202);
    await request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/alertas/${ingesta.body.alertaId}/resolucion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notas: '' })
      .expect(400);
  });
});

describe('exportación del historial · HU-32', () => {
  let app: INestApplication;
  let token: string;
  const rango = {
    desde: new Date(Date.now() - 3_600_000).toISOString(),
    hasta: new Date(Date.now() + 3_600_000).toISOString(),
  };

  beforeAll(async () => {
    const firmante = await crearFirmante();
    app = await crearApp(firmante);
    token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  });
  afterAll(async () => {
    await app.close();
  });

  const exportar = (formato: string) =>
    request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/eventos/exportacion`)
      .query({ ...rango, formato })
      .set('Authorization', `Bearer ${token}`);

  it('CSV con el tipo y el nombre de fichero correctos', async () => {
    const r = await exportar('csv').expect(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toContain('.csv');
    expect(r.headers['x-ncr-truncado']).toBe('no');
  });

  it('Excel', async () => {
    const r = await exportar('excel').expect(200);
    expect(r.headers['content-disposition']).toContain('.xls');
  });

  it('PDF', async () => {
    const r = await exportar('pdf').expect(200);
    expect(r.headers['content-type']).toContain('application/pdf');
  });

  it('un formato no admitido: 400', async () => {
    await exportar('docx').expect(400);
  });
});

describe('flujo en vivo (SSE) y aislamiento', () => {
  let app: INestApplication;
  let firmante: Firmante;

  beforeAll(async () => {
    firmante = await crearFirmante();
    app = await crearApp(firmante);
  });
  afterAll(async () => {
    await app.close();
  });

  it('el operador de OTRA copropiedad no abre el flujo: 404 antes de la cabecera', async () => {
    const ajeno = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    await request(app.getHttpServer())
      .get(`/copropiedades/${COP_A}/eventos/flujo`)
      .set('Authorization', `Bearer ${ajeno}`)
      .expect(404);
  });

  it('sin token, tampoco: 401', async () => {
    await request(app.getHttpServer()).get(`/copropiedades/${COP_A}/eventos/flujo`).expect(401);
  });

  it('el suyo sí, y el primer mensaje confirma la copropiedad', async () => {
    // El operador de central alcanza por `copropiedades`, no por
    // `copropiedad_id`: su turno puede cubrir varias (S-10, KPI-35).
    const propio = await tokenDe(firmante, {
      rol: 'operador_central',
      copropiedadId: COP_A,
      copropiedades: [COP_A],
    });
    const servidor = app.getHttpServer();

    // El flujo no termina solo: se corta en cuanto llega el primer mensaje.
    const cuerpo = await new Promise<string>((resolver, rechazar) => {
      const peticion = request(servidor)
        .get(`/copropiedades/${COP_A}/eventos/flujo`)
        .set('Authorization', `Bearer ${propio}`)
        .buffer(false)
        .parse((res, callback) => {
          res.on('data', (trozo: Buffer) => {
            resolver(trozo.toString('utf8'));
            peticion.abort();
            callback(null, null);
          });
          res.on('error', callback);
        });
      peticion.end((error) => {
        // `abort()` produce un error esperado: ya tenemos lo que buscábamos.
        if (error && !/aborted|ECONNRESET/i.test(String(error))) rechazar(error);
      });
    });

    expect(cuerpo).toContain('event: listo');
    expect(cuerpo).toContain(COP_A);
  });
});

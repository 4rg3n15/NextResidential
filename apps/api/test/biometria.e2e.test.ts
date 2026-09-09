import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { FACE_TEMPLATE_PROVIDER } from '@ncr/domain-core';
import type { MockProvider } from '@ncr/providers';
import { AlmacenEnMemoria } from '../src/biometria/infraestructura/boveda-cifrada';

/**
 * CU-02 completo por HTTP: captura → calidad → consentimiento del TITULAR →
 * sincronización → revocación → supresión.
 *
 * Lo que esta suite vigila además del camino feliz es una ausencia: **ninguna
 * ruta devuelve un vector biométrico**. Se comprueba enumerando el enrutador,
 * no leyendo el código, para que siga siendo cierto cuando alguien añada un
 * controlador dentro de seis meses.
 */
const TITULAR = '40000000-0000-4000-8000-000000000103';
const HORA = 3_600_000;
/** Terminal facial dada de alta en el `MockProvider` (ADR-03). */
const TERMINAL = '90000000-0000-4000-8000-000000000001';
const TERMINAL_DESCONOCIDA = '90000000-0000-4000-8000-0000000000ff';

let app: INestApplication;
let firmante: Firmante;
let tokenAdmin: string;
let tokenTitular: string;

const VECTOR = Buffer.from([9, 8, 7, 6, 5, 4, 3, 2, 1]).toString('base64');

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  tokenAdmin = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  // El titular es un visitante: alcanza sus rutas con el token que recibe por
  // el canal de la solicitud, y su `usuario_id` es su propia persona.
  tokenTitular = await tokenDe(firmante, {
    rol: 'residente',
    copropiedadId: COP_A,
    usuarioId: TITULAR,
  });
  // El `MockProvider` rechaza un equipo que no conoce, que es exactamente lo
  // que hace un lector real. Se da de alta el que la suite usa como terminal
  // buena, y se deja otro sin dar de alta para probar el camino de fallo.
  (app.get(FACE_TEMPLATE_PROVIDER) as MockProvider).dispositivos.add(TERMINAL);
});
afterAll(async () => {
  await app?.close();
});

const comoAdmin = (metodo: 'get' | 'post', ruta: string) =>
  request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${tokenAdmin}`);
const comoTitular = (metodo: 'get' | 'post', ruta: string) =>
  request(app.getHttpServer())[metodo](ruta).set('Authorization', `Bearer ${tokenTitular}`);

const base = `/copropiedades/${COP_A}/biometria`;

const capturar = async (extra: Record<string, unknown> = {}) => {
  const r = await comoAdmin('post', `${base}/capturas`)
    .send({
      titularId: TITULAR,
      medidas: { rostrosDetectados: 1, nitidez: 0.85, iluminacion: 0.6, proporcionRostro: 0.4 },
      vector: VECTOR,
      versionPolitica: 'v1.0',
      canal: 'app',
      suprimirEn: new Date(Date.now() + 8 * HORA).toISOString(),
      ...extra,
    })
    .expect(201);
  return r.body as { aceptada: boolean; plantillaId: string; consentimientoId: string };
};

describe('biometría · CU-02 por HTTP', () => {
  it('una captura de mala calidad se rechaza CON los motivos, sin pedir consentimiento', async () => {
    const r = await comoAdmin('post', `${base}/capturas`)
      .send({
        titularId: TITULAR,
        medidas: { rostrosDetectados: 2, nitidez: 0.2, iluminacion: 0.6, proporcionRostro: 0.4 },
        vector: VECTOR,
        versionPolitica: 'v1.0',
        canal: 'app',
        suprimirEn: new Date(Date.now() + 8 * HORA).toISOString(),
      })
      .expect(201);
    expect(r.body.aceptada).toBe(false);
    expect(r.body.motivos).toEqual(expect.arrayContaining(['ROSTROS_MULTIPLES', 'NITIDEZ']));
    expect(r.body).not.toHaveProperty('consentimientoId');
  });

  it('una captura buena crea la solicitud PENDIENTE', async () => {
    const { consentimientoId } = await capturar();
    const r = await comoAdmin('get', `${base}/consentimientos/${consentimientoId}`).expect(200);
    expect(r.body).toMatchObject({ estado: 'pendiente', versionPolitica: 'v1.0' });
  });

  it('la consulta del consentimiento NO devuelve dato biométrico alguno', async () => {
    const { consentimientoId } = await capturar();
    const r = await comoAdmin('get', `${base}/consentimientos/${consentimientoId}`).expect(200);
    const texto = JSON.stringify(r.body);
    expect(texto).not.toContain('vector');
    expect(texto).not.toContain('llave');
    expect(texto).not.toContain(VECTOR.slice(0, 8));
  });

  it('el ADMINISTRADOR no puede aceptar por el titular (RN-10)', async () => {
    const { consentimientoId } = await capturar();
    const r = await comoAdmin('post', `${base}/consentimientos/${consentimientoId}/respuesta`)
      .send({ acepta: true })
      .expect(403);
    expect(JSON.stringify(r.body)).toContain('titular');
  });

  it('el titular acepta, y solo entonces se puede sincronizar (RN-09, CA-09)', async () => {
    const { consentimientoId, plantillaId } = await capturar();

    await comoAdmin('post', `${base}/plantillas/${plantillaId}/sincronizacion`)
      .send({ dispositivoId: TERMINAL })
      .expect(403);

    await comoTitular('post', `${base}/consentimientos/${consentimientoId}/respuesta`)
      .send({ acepta: true })
      .expect(201);

    await comoAdmin('post', `${base}/plantillas/${plantillaId}/sincronizacion`)
      .send({ dispositivoId: TERMINAL })
      .expect(201);
  });

  it('una terminal que no responde da 503, NO un 403 ni un 500', async () => {
    // Distinguirlo importa: 403 acusaría al visitante de no haber consentido, y
    // 500 diría «error interno» donde el hecho es «el lector no contestó».
    const { consentimientoId, plantillaId } = await capturar();
    await comoTitular('post', `${base}/consentimientos/${consentimientoId}/respuesta`)
      .send({ acepta: true })
      .expect(201);

    const r = await comoAdmin('post', `${base}/plantillas/${plantillaId}/sincronizacion`)
      .send({ dispositivoId: TERMINAL_DESCONOCIDA })
      .expect(503);
    expect(JSON.stringify(r.body)).toContain(TERMINAL_DESCONOCIDA);
  });

  it('el titular rechaza y la sincronización sigue cerrada', async () => {
    const { consentimientoId, plantillaId } = await capturar();
    await comoTitular('post', `${base}/consentimientos/${consentimientoId}/respuesta`)
      .send({ acepta: false })
      .expect(201);
    await comoAdmin('post', `${base}/plantillas/${plantillaId}/sincronizacion`)
      .send({ dispositivoId: TERMINAL })
      .expect(403);
  });

  it('revocar suprime: el sobre cifrado desaparece del almacén (CA-11)', async () => {
    const { consentimientoId, plantillaId } = await capturar();
    await comoTitular('post', `${base}/consentimientos/${consentimientoId}/respuesta`)
      .send({ acepta: true })
      .expect(201);

    const almacen = app.get(AlmacenEnMemoria);
    const r = await comoTitular(
      'post',
      `${base}/consentimientos/${consentimientoId}/revocacion`,
    ).expect(201);
    expect(r.body.plantillasSuprimidas).toBeGreaterThanOrEqual(1);
    expect(await almacen.tomar(`${COP_A}/${plantillaId}`)).toBeNull();
  });

  it('un plazo de conservación fuera de la cota se rechaza (RN-11)', async () => {
    await comoAdmin('post', `${base}/capturas`)
      .send({
        titularId: TITULAR,
        medidas: { rostrosDetectados: 1, nitidez: 0.85, iluminacion: 0.6, proporcionRostro: 0.4 },
        vector: VECTOR,
        versionPolitica: 'v1.0',
        canal: 'app',
        suprimirEn: new Date(Date.now() + 6 * 365 * 24 * HORA).toISOString(),
      })
      .expect(403);
  });

  it('el DTO rechaza un vector que no es base64 y medidas fuera de rango', async () => {
    await comoAdmin('post', `${base}/capturas`)
      .send({
        titularId: TITULAR,
        medidas: { rostrosDetectados: 1, nitidez: 5, iluminacion: 0.6, proporcionRostro: 0.4 },
        vector: 'no-es-base64-***',
        versionPolitica: 'v1.0',
        canal: 'app',
        suprimirEn: new Date(Date.now() + 8 * HORA).toISOString(),
      })
      .expect(400);
  });

  it('el barrido responde con las dos cuentas separadas', async () => {
    const r = await comoAdmin('post', `${base}/barrido`).expect(201);
    expect(r.body).toHaveProperty('suprimidas');
    expect(r.body).toHaveProperty('retiradas');
    expect(r.body).toHaveProperty('retiradasFallidas');
  });
});

describe('biometría · lo que no existe', () => {
  it('NINGUNA ruta expone un vector, una plantilla en claro ni una llave', () => {
    const servidor = app.getHttpAdapter().getInstance() as {
      _router?: { stack: { route?: { path: string } }[] };
      router?: { stack: { route?: { path: string } }[] };
    };
    const pila = servidor._router?.stack ?? servidor.router?.stack ?? [];
    const rutas = pila.flatMap((c) => (c.route ? [c.route.path] : []));
    expect(rutas.filter((r) => /vector|llave|plantillas\/[^/]+$/.test(r))).toEqual([]);
    // Y sí existen las del ciclo, para que la prueba no pase por estar vacía.
    expect(rutas.some((r) => r.includes('biometria/capturas'))).toBe(true);
  });
});

describe('biometría · aislamiento', () => {
  it('un administrador de otra copropiedad no captura aquí', async () => {
    const ajeno = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_B });
    await request(app.getHttpServer())
      .post(`${base}/capturas`)
      .set('Authorization', `Bearer ${ajeno}`)
      .send({
        titularId: TITULAR,
        medidas: { rostrosDetectados: 1, nitidez: 0.85, iluminacion: 0.6, proporcionRostro: 0.4 },
        vector: VECTOR,
        versionPolitica: 'v1.0',
        canal: 'app',
        suprimirEn: new Date(Date.now() + 8 * HORA).toISOString(),
      })
      .expect(404);
  });

  it('sin token no se llega a ninguna ruta de biometría', async () => {
    await request(app.getHttpServer()).post(`${base}/barrido`).expect(401);
  });
});

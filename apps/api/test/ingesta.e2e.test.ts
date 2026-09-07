import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, configuracionDePrueba, crearApp, crearFirmante } from './utilidades';
import {
  CABECERA_FIRMA,
  CABECERA_MARCA,
  firmar,
} from '../src/autorizaciones/presentacion/firma-ingesta';

/**
 * RNF-03.11 · El endpoint de ingesta rechaza lo que no viene firmado.
 *
 * Se prueba contra la aplicación REAL —guard global de autenticación incluido—
 * porque lo que hay que demostrar no es que la función de firma calcule bien un
 * HMAC (eso ya está probado aparte), sino que la ruta pública **no queda
 * abierta** por estar exenta de sesión.
 */
describe('ingesta de eventos de hardware', () => {
  let app: INestApplication;

  const evento = {
    copropiedadId: COP_A,
    dispositivoId: 'disp-talanquera-1',
    metodo: 'placa' as const,
    placaLeida: 'ABC123',
    confianzaCentesimas: 95,
    referenciaExterna: 'ev-000123',
  };

  const enviar = (cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
    request(app.getHttpServer()).post('/ingesta/eventos').set(cabeceras).send(cuerpo);

  const firmado = (cuerpo: object): Record<string, string> => {
    const marca = String(Math.floor(Date.now() / 1000));
    // Se firma EXACTAMENTE lo que supertest va a enviar.
    const crudo = JSON.stringify(cuerpo);
    return {
      [CABECERA_MARCA]: marca,
      [CABECERA_FIRMA]: firmar(configuracionDePrueba.INGESTA_FIRMA_SECRETO, marca, crudo),
      'content-type': 'application/json',
    };
  };

  beforeAll(async () => {
    app = await crearApp(await crearFirmante());
  });
  afterAll(async () => {
    await app.close();
  });

  it('sin firma: 401, aunque la ruta sea pública', async () => {
    await enviar(evento).expect(401);
  });

  it('con firma inventada: 401', async () => {
    await enviar(evento, {
      [CABECERA_MARCA]: String(Math.floor(Date.now() / 1000)),
      [CABECERA_FIRMA]: 'a'.repeat(64),
    }).expect(401);
  });

  it('con firma vieja: 401 (no se puede reenviar un POST capturado)', async () => {
    const marca = String(Math.floor(Date.now() / 1000) - 3600);
    const crudo = JSON.stringify(evento);
    await enviar(evento, {
      [CABECERA_MARCA]: marca,
      [CABECERA_FIRMA]: firmar(configuracionDePrueba.INGESTA_FIRMA_SECRETO, marca, crudo),
    }).expect(401);
  });

  it('con firma válida: 202 y clave de idempotencia del dominio (RN-17)', async () => {
    const r = await enviar(evento, firmado(evento)).expect(202);
    expect(r.body).toEqual({
      aceptado: true,
      claveIdempotencia: `${COP_A}:disp-talanquera-1:placa:ev-000123`,
    });
  });

  it('firmado pero con el cuerpo mal formado: 400, no 202', async () => {
    const malo = { ...evento, confianzaCentesimas: 500 };
    await enviar(malo, firmado(malo)).expect(400);
  });

  it('firmado con un campo no declarado: 400 (whitelist estricta, §2.7.3)', async () => {
    const conExtra = { ...evento, colada: 'x' };
    await enviar(conExtra, firmado(conExtra)).expect(400);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';

/**
 * D-73 · **la vigencia invertida se rechaza en el servidor, y el motivo se
 * nombra.**
 *
 * El formulario aceptó «desde las 5:45 p. m., hasta las 5:45 a. m. del mismo
 * día» y lo envió. Lo que volvió fue `personaId must be a UUID`: el rechazo del
 * OTRO campo, porque el `ValidationPipe` corre antes que el dominio. La
 * vigencia invertida ni se llegó a mencionar.
 *
 * Aquí el cuerpo es válido en FORMA —los dos identificadores son UUID— para que
 * el pipe no tenga nada que decir y quede a la vista quién rechaza de verdad:
 * `Vigencia.crear`. Y se exige que el mensaje hable de la vigencia; un 400 sin
 * motivo obliga a adivinar, que es lo que costó la mañana del 13.
 */
const VIVIENDA = '30000000-0000-4000-8000-0000000000bb';
const PERSONA = '20000000-0000-4000-8000-0000000000aa';

describe('vigencia de la autorización (RN-01)', () => {
  let app: INestApplication;
  let admin: string;

  beforeAll(async () => {
    const firmante = await crearFirmante();
    app = await crearApp(firmante);
    admin = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
  });
  afterAll(async () => {
    await app.close();
  });

  const crear = (desde: string, hasta: string) =>
    request(app.getHttpServer())
      .post(`/copropiedades/${COP_A}/autorizaciones`)
      .set('authorization', `Bearer ${admin}`)
      .send({ viviendaId: VIVIENDA, personaId: PERSONA, desde, hasta });

  it('la que termina antes de empezar se rechaza NOMBRANDO la vigencia', async () => {
    const r = await crear('2026-09-13T22:45:00.000Z', '2026-09-13T10:45:00.000Z').expect(400);
    expect(JSON.stringify(r.body)).toMatch(/vigencia/i);
    // Y no menciona el UUID: ese campo estaba bien y culparlo fue el defecto.
    expect(JSON.stringify(r.body)).not.toMatch(/uuid/i);
  });

  it('la de duración cero también: el intervalo es cerrado-abierto', async () => {
    const instante = '2026-12-01T10:00:00.000Z';
    await crear(instante, instante).expect(400);
  });

  it('la que nace expirada se rechaza aunque el orden sea correcto (RN-01)', async () => {
    const r = await crear('2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z').expect(400);
    expect(JSON.stringify(r.body)).toMatch(/expirad/i);
  });
});

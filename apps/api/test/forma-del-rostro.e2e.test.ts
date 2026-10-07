import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { MAX_BASE64_FOTOGRAFIA } from '../src/visitas';
import { POLITICA_DEL_ROSTRO } from '../src/residente/aplicacion/politica-del-rostro';
import { ipDePrueba } from './banco-del-hogar-pg';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import { USUARIO_R1 } from './dobles/directorio-del-residente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · LA FORMA DE LO QUE ENTRA EN «MI ROSTRO» (§2.7.3)
 *
 * Lo rechaza el `ValidationPipe` antes de que el caso de uso mire nada: sin la
 * política aceptada —`false` o ausente—, con un tipo que no es JPEG ni PNG, o
 * con un base64 que pasa del tope ANTES de decodificarlo. Que el contenido sea
 * de verdad la imagen que dice ser lo juzga `revisarFoto` por sus bytes
 * (`mi-rostro.test.ts`); los campos prohibidos, `campos-prohibidos-del-residente`.
 *
 * Sin base: con la forma mal, ninguna petición llega a la biometría.
 * ═════════════════════════════════════════════════════════════════════════════
 */
let app: INestApplication;
let token = '';
beforeAll(async () => {
  const firmante = await crearFirmante();
  app = await crearApp(firmante);
  token = await tokenDe(firmante, {
    rol: 'residente',
    copropiedadId: COP_A,
    usuarioId: USUARIO_R1,
    aal: 'aal1',
  });
});
afterAll(async () => {
  await app?.close();
});

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(48, 7),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');
const valido = {
  contenidoBase64: JPEG,
  tipoMime: 'image/jpeg',
  medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
  versionPolitica: POLITICA_DEL_ROSTRO.version,
  aceptaPolitica: true,
};
const enviar = (cuerpo: Record<string, unknown>) =>
  request(app.getHttpServer())
    .post(`/copropiedades/${COP_A}/mi/rostro`)
    .set('Authorization', `Bearer ${token}`)
    .set('x-forwarded-for', ipDePrueba())
    .send(cuerpo);

describe('15-X · D2 · la forma del cuerpo de «Mi rostro»', () => {
  it('sin aceptar la política —false o ausente—: 400, y lo dice', async () => {
    const falsa = await enviar({ ...valido, aceptaPolitica: false });
    expect(falsa.status).toBe(400);
    expect(JSON.stringify(falsa.body)).toMatch(/aceptar la política del rostro/);
    const sinAceptar: Record<string, unknown> = { ...valido };
    delete sinAceptar.aceptaPolitica;
    expect((await enviar(sinAceptar)).status).toBe(400);
  });

  it('un tipo que no es JPEG ni PNG: 400', async () => {
    expect((await enviar({ ...valido, tipoMime: 'image/gif' })).status).toBe(400);
  });

  it('un base64 por encima del tope se rechaza ANTES de decodificarlo', async () => {
    const grande = 'A'.repeat(MAX_BASE64_FOTOGRAFIA + 4);
    const r = await enviar({ ...valido, contenidoBase64: grande });
    expect([400, 413]).toContain(r.status);
  });

  it('la forma correcta pasa la validación (lo que siga lo decide la biometría)', async () => {
    const r = await enviar(valido);
    expect(r.status, JSON.stringify(r.body)).not.toBe(400);
  });
});

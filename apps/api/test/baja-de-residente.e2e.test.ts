import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import { USUARIO_R1 } from './dobles/directorio-del-residente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * DT-15S1-03 · LA BAJA DE UN RESIDENTE, POR EL BANCO SIN BASE
 *
 * `HogarEnMemoria` declaraba cumplir `CuentasDeResidentes` y no tenía
 * `darDeBaja`. La ruta existía y ninguna prueba sin base llegaba hasta el caso
 * de uso, así que nadie veía que por ese doble acababa en un `TypeError` y un
 * 500: el compilador lo decía, pero las pruebas no se compilaban. Esto recorre
 * la ruta de verdad —guarda, alcance, DTO, caso de uso— hasta el doble.
 *
 * Lo que sólo sostiene la base —rol y vínculos inactivos en una transacción, la
 * constancia en `auditoria_seguridad`, el token que ya no se emite— lo prueba
 * `baja-de-residente-pg.test.ts`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
let app: INestApplication;
let superadmin: string;

beforeAll(async () => {
  const firmante = await crearFirmante();
  app = await crearApp(firmante);
  superadmin = await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: null });
});
afterAll(async () => {
  await app?.close();
});

const baja = (copropiedadId: string) =>
  request(app.getHttpServer())
    .post(`/copropiedades/${copropiedadId}/residentes/cuentas/${USUARIO_R1}/baja`)
    .set('Authorization', `Bearer ${superadmin}`)
    .send({ motivo: 'Se mudó de la copropiedad' });

const activaEn = async (copropiedadId: string): Promise<boolean | undefined> => {
  const lista = await request(app.getHttpServer())
    .get(`/copropiedades/${copropiedadId}/residentes/cuentas`)
    .set('Authorization', `Bearer ${superadmin}`);
  expect(lista.status, JSON.stringify(lista.body)).toBe(200);
  return (lista.body as { usuarioId: string; activa: boolean }[]).find(
    (c) => c.usuarioId === USUARIO_R1,
  )?.activa;
};

describe('C9 · baja de un residente en el banco sin base (DT-15S1-03)', () => {
  it('en otra copropiedad no hay residente activo con ese identificador: 404', async () => {
    expect((await baja(COP_B)).status).toBe(404);
    expect(await activaEn(COP_A)).toBe(true);
  });

  it('la baja responde 200 y la cuenta sigue en la lista, «de baja» (RN-19)', async () => {
    const r = await baja(COP_A);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toEqual({ dadaDeBaja: true, plantillasSuprimidas: 0 });
    expect(await activaEn(COP_A)).toBe(false);
  });

  it('repetirla es 404: ya no hay residente ACTIVO con ese identificador', async () => {
    expect((await baja(COP_A)).status).toBe(404);
  });
});

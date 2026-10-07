import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, rutasConRol, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { USUARIO_R1, USUARIO_R2, USUARIO_RB } from './dobles/directorio-del-residente';
import { MENOR_V1, MENOR_V2 } from './dobles/menores-para-el-rostro';
import { CON_RECURSO_DE_LA_VIVIENDA } from './rutas-con-recurso-de-vivienda';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SUITE DE AISLAMIENTO · RUTAS QUE NOMBRAN UN RECURSO DE LA VIVIENDA (15-X, D3)
 *
 * El rostro de un menor se pide por `:residenteId`. Lo que esta suite exige,
 * sin base y con el doble de menores (uno en cada vivienda de la copropiedad A):
 *
 *  · camino del usuario · R1 nombra al menor de la vivienda 2 y R2 al de la 1:
 *    404 en las tres rutas —el identificador ajeno no existe para él—. Un
 *    residente de la copropiedad B, con su token legítimo: tampoco las alcanza.
 *  · camino de servicio · la identidad de servicio, la que omite la RLS, no
 *    está admitida en ninguna: 403.
 *  · línea base · R1 con SU menor: 200, 201 y 200. Sin ella, un 404 de todo
 *    pasaría por aislamiento.
 * ═════════════════════════════════════════════════════════════════════════════
 */
let app: INestApplication;
let firmante: Firmante;
let ip = 0;
beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
});
afterAll(async () => {
  await app?.close();
});

const residente = (usuarioId: string, copropiedadId: string) =>
  tokenDe(firmante, { rol: 'residente', copropiedadId, usuarioId, aal: 'aal1' });

const llamar = (clave: string, menor: string, token: string, copropiedadId = COP_A) => {
  const ruta = CON_RECURSO_DE_LA_VIVIENDA[clave];
  if (ruta === undefined) throw new Error(`sin declarar: ${clave}`);
  const camino = clave
    .slice(clave.indexOf(' ') + 1)
    .replace(':id', copropiedadId)
    .replace(':residenteId', menor);
  ip += 1;
  const servidor = request(app.getHttpServer());
  const p = servidor[ruta.metodo](camino)
    .set('Authorization', `Bearer ${token}`)
    .set('x-forwarded-for', `198.51.100.${String((ip % 250) + 1)}`);
  return ruta.cuerpo === undefined ? p : p.send(ruta.cuerpo);
};

describe('15-X (D3) · el recurso de la vivienda, por los dos caminos', () => {
  it('las rutas declaradas existen y son del residente (y no hay otras con :residenteId/rostro)', () => {
    const delResidente = rutasConRol(app, 'residente').map((r) => `${r.metodo} ${r.ruta}`);
    expect(delResidente).toEqual(expect.arrayContaining(Object.keys(CON_RECURSO_DE_LA_VIVIENDA)));
    expect(delResidente.filter((c) => c.includes(':residenteId/rostro')).sort()).toEqual(
      Object.keys(CON_RECURSO_DE_LA_VIVIENDA).sort(),
    );
  });

  it('camino del usuario · el menor del VECINO no existe para mí: 404 en las tres', async () => {
    const fugas: string[] = [];
    for (const [quien, menor] of [
      [USUARIO_R1, MENOR_V2],
      [USUARIO_R2, MENOR_V1],
    ] as const) {
      const token = await residente(quien, COP_A);
      for (const clave of Object.keys(CON_RECURSO_DE_LA_VIVIENDA)) {
        const r = await llamar(clave, menor, token);
        if (r.status !== 404) fugas.push(`${quien} · ${clave} → ${String(r.status)}`);
      }
    }
    expect(fugas).toEqual([]);
  });

  it('camino del usuario · un residente de OTRA copropiedad no las alcanza', async () => {
    const token = await residente(USUARIO_RB, COP_B);
    for (const clave of Object.keys(CON_RECURSO_DE_LA_VIVIENDA)) {
      const r = await llamar(clave, MENOR_V1, token);
      expect([403, 404], `${clave} → ${String(r.status)}`).toContain(r.status);
    }
  });

  it('camino de servicio · la identidad que omite la RLS no está admitida: 403', async () => {
    const token = await tokenDe(firmante, { rol: 'servicio', copropiedadId: COP_A, aal: 'aal1' });
    for (const clave of Object.keys(CON_RECURSO_DE_LA_VIVIENDA)) {
      expect((await llamar(clave, MENOR_V1, token)).status, clave).toBe(403);
    }
  });

  it('línea base · con SU menor, R1 lee, registra y retira', async () => {
    const token = await residente(USUARIO_R1, COP_A);
    for (const [clave, { conElPropio }] of Object.entries(CON_RECURSO_DE_LA_VIVIENDA)) {
      const r = await llamar(clave, MENOR_V1, token);
      expect(r.status, `${clave} → ${JSON.stringify(r.body)}`).toBe(conElPropio);
    }
  });
});

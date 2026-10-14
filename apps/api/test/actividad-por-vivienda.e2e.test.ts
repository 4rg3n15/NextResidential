import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { ACTIVIDAD_POR_VIVIENDA } from '../src/tablero';
import type { ActividadPorViviendaEnMemoria } from '../src/tablero/infraestructura/actividad-por-vivienda-en-memoria';
import type { Rol } from '../src/autenticacion';

/**
 * 15-Z3 (D-Z3) · quién ve la actividad por vivienda y qué forma tiene.
 * Portero, administrador y superadministrador sí; residente y operador de
 * central no (S-15Z3-01); otra copropiedad, 404. La ruta entra sola en la
 * suite de aislamiento por la enumeración del enrutador.
 */
let app: INestApplication;
let firmante: Firmante;

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  const puerto = app.get<ActividadPorViviendaEnMemoria>(ACTIVIDAD_POR_VIVIENDA);
  puerto.declarar(COP_A, [
    {
      viviendaId: '30000000-0000-4000-8000-000000000001',
      identificador: '101',
      agrupacion: 'Torre 1',
      vehiculosEnVisita: 0,
      visitantesAhora: 0,
    },
    {
      viviendaId: '30000000-0000-4000-8000-000000000002',
      identificador: '302',
      agrupacion: 'Torre 3',
      vehiculosEnVisita: 1,
      visitantesAhora: 2,
    },
  ]);
  puerto.declarar(COP_B, []);
});
afterAll(async () => {
  await app?.close();
});

const leer = async (rol: Rol, cop = COP_A, extra: { copropiedades?: string[] } = {}) =>
  request(app.getHttpServer())
    .get(`/copropiedades/${cop}/tablero/actividad-por-vivienda`)
    .set(
      'Authorization',
      `Bearer ${await tokenDe(firmante, { rol, copropiedadId: cop, ...extra })}`,
    );

describe('GET /copropiedades/:id/tablero/actividad-por-vivienda', () => {
  it('el portero ve las viviendas ordenadas por actividad, con el criterio y el instante', async () => {
    const res = await leer('portero');
    expect(res.status).toBe(200);
    expect(res.body.filas.map((f: { identificador: string }) => f.identificador)).toEqual([
      '302',
      '101',
    ]);
    expect(res.body.filas[0]).toEqual({
      viviendaId: '30000000-0000-4000-8000-000000000002',
      identificador: '302',
      agrupacion: 'Torre 3',
      vehiculosEnVisita: 1,
      visitantesAhora: 2,
    });
    expect(res.body.criterio).toMatch(/P-41/);
    expect(Date.parse(res.body.ahora)).not.toBeNaN();
    // Sólo recuentos: ningún nombre, documento ni placa.
    expect(Object.keys(res.body.filas[0]).sort()).toEqual(
      ['agrupacion', 'identificador', 'vehiculosEnVisita', 'viviendaId', 'visitantesAhora'].sort(),
    );
  });

  it('administrador y superadministrador también; residente y operador de central, 403', async () => {
    expect((await leer('administrador')).status).toBe(200);
    expect(
      (await leer('superadministrador', COP_A, { copropiedades: [COP_A, COP_B] })).status,
    ).toBe(200);
    expect((await leer('residente')).status).toBe(403);
    expect((await leer('operador_central')).status).toBe(403);
  });

  it('la copropiedad ajena responde 404, y una desconocida para el puerto también', async () => {
    const ajena = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_B}/tablero/actividad-por-vivienda`)
      .set(
        'Authorization',
        `Bearer ${await tokenDe(firmante, { rol: 'portero', copropiedadId: COP_A })}`,
      );
    expect(ajena.status).toBe(404);
    const desconocida = '10000000-0000-4000-8000-0000000000ff';
    const sinFilas = await request(app.getHttpServer())
      .get(`/copropiedades/${desconocida}/tablero/actividad-por-vivienda`)
      .set(
        'Authorization',
        `Bearer ${await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: null, copropiedades: [desconocida] })}`,
      );
    expect(sinFilas.status).toBe(404);
  });
});

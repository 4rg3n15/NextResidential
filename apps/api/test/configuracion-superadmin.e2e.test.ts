import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';

/**
 * A7 (15-E) · EL SUPERADMINISTRADOR PUEDE GUARDAR LA CONFIGURACIÓN — CONTRA LA API.
 *
 * La consola enviaba `umbralConfianzaPlaca` y `umbralLatidoMinutos`, que la API
 * retiró en la 15-B; con `forbidNonWhitelisted`, TODO guardado respondía 400 y
 * nadie lo vio porque la prueba de la consola hablaba con un doble. Ésta manda
 * EXACTAMENTE el cuerpo que arma `formulario.tsx` al `ValidationPipe` real, y
 * comprueba que lo guardado se lee después. La otra mitad —que la consola no
 * vuelva a mandar un campo fuera del contrato— vive en `formulario.test.tsx`,
 * contra el esquema OpenAPI versionado.
 */
let app: INestApplication;
let firmante: Firmante;

/** El cuerpo tal cual lo construye la consola (formulario.tsx, `guardar`). */
const CUERPO_DE_LA_CONSOLA = {
  nombre: `Copropiedad B · ${String(Date.now())}`,
  direccion: 'Calle de la Prueba 12',
  tipo: 'casas',
  etiquetaVivienda: 'Casa',
  etiquetaAgrupacion: 'Manzana',
  zonaHoraria: 'America/Bogota',
  politicaContingenciaEdge: 'escalar_portero',
};

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
});
afterAll(async () => {
  await app?.close();
});

describe('PATCH /copropiedades/:id/configuracion con el cuerpo de la consola', () => {
  it('el superadministrador (sin copropiedad en el token) guarda y recibe 200', async () => {
    const token = await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: null });
    const res = await request(app.getHttpServer())
      .patch(`/copropiedades/${COP_B}/configuracion`)
      .set('Authorization', `Bearer ${token}`)
      .send(CUERPO_DE_LA_CONSOLA);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.nombre).toBe(CUERPO_DE_LA_CONSOLA.nombre);
    expect(res.body.politicaContingenciaEdge).toBe('escalar_portero');
  });

  it('lo guardado se lee después: el cambio persiste', async () => {
    const token = await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: null });
    const res = await request(app.getHttpServer())
      .get(`/copropiedades/${COP_B}/configuracion`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe(CUERPO_DE_LA_CONSOLA.nombre);
    expect(res.body.etiquetaAgrupacion).toBe('Manzana');
  });

  it('un campo retirado del contrato sigue siendo 400: el pipe no se relajó para arreglarlo', async () => {
    const token = await tokenDe(firmante, { rol: 'superadministrador', copropiedadId: null });
    const res = await request(app.getHttpServer())
      .patch(`/copropiedades/${COP_B}/configuracion`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...CUERPO_DE_LA_CONSOLA, umbralConfianzaPlaca: 0.8 });
    expect(res.status).toBe(400);
  });
});

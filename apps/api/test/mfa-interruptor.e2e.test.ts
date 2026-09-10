import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';

/**
 * `MFA_OBLIGATORIO` · el interruptor temporal del segundo factor.
 *
 * **Por qué esta suite existe y por qué prueba las dos posiciones.** Un
 * interruptor de seguridad tiene dos modos de fallo, y el peligroso no es el
 * obvio:
 *
 *  1. Que apagado no apague — molesto, se descubre enseguida.
 *  2. Que encendido no encienda — una API que cree exigir segundo factor y no
 *     lo exige. Ese no se descubre nunca, porque nadie prueba lo que da por
 *     hecho. Por eso la primera comprobación de aquí es que **con el valor por
 *     defecto la regla sigue en vigor**, y por eso el resto de la suite (363
 *     pruebas) corre con `MFA_OBLIGATORIO: true` explícito.
 *
 * Y una tercera, la que hace que esto sea una desviación acotada y no un
 * agujero: apagarlo **no** relaja nada más. Ni la firma del token, ni el rol,
 * ni la copropiedad. Se comprueba abajo.
 */
let firmante: Firmante;
let conRegla: INestApplication;
let sinRegla: INestApplication;

beforeAll(async () => {
  firmante = await crearFirmante();
  conRegla = await crearApp(firmante);
  sinRegla = await crearApp(firmante, undefined, { MFA_OBLIGATORIO: false });
});
afterAll(async () => {
  await conRegla?.close();
  await sinRegla?.close();
});

const sesion = (app: INestApplication, token: string) =>
  request(app.getHttpServer()).get('/auth/sesion').set('Authorization', `Bearer ${token}`);

describe('con la regla en vigor (por defecto)', () => {
  it('un rol administrativo con aal1 NO entra (RN-20, CA-25)', async () => {
    const token = await tokenDe(firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
    });
    await sesion(conRegla, token).expect(401);
  });

  it('y con aal2 sí entra: el rechazo era por el nivel, no por otra cosa', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    await sesion(conRegla, token).expect(200);
  });
});

describe('con MFA_OBLIGATORIO=false', () => {
  it('el mismo token aal1 que antes se rechazaba ahora entra', async () => {
    const token = await tokenDe(firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
    });
    await sesion(sinRegla, token).expect(200);
  });

  it('la sesión declara mfaVerificado=false: la desviación no se disfraza', async () => {
    const token = await tokenDe(firmante, {
      rol: 'superadministrador',
      copropiedadId: null,
      aal: 'aal1',
    });
    const res = await sesion(sinRegla, token).expect(200);
    expect((res.body as { mfaVerificado: boolean }).mfaVerificado).toBe(false);
  });

  it('sigue haciendo falta un token: sin cabecera no entra nadie', async () => {
    await request(sinRegla.getHttpServer()).get('/auth/sesion').expect(401);
  });

  it('sigue haciendo falta que la FIRMA sea válida', async () => {
    const otro = await crearFirmante();
    const ajeno = await tokenDe(otro, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
    });
    await sesion(sinRegla, ajeno).expect(401);
  });

  it('y el aislamiento por copropiedad NO se relaja: 404 sobre una ajena', async () => {
    const token = await tokenDe(firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
    });
    await request(sinRegla.getHttpServer())
      .get('/copropiedades/00000000-0000-4000-8000-0000000000ff')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, enumerarRutas, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';

/**
 * ADR-008 · el segundo factor lo emite **solo** Supabase Auth.
 *
 * Esta suite fija la retirada de `/auth/mfa/*`, y lo hace por dos vías porque
 * una sola no bastaría:
 *
 *  - **Las rutas no existen en el enrutador.** Comprobar solo el 404 no
 *    distinguiría «la ruta no existe» de «la ruta existe y el guard la
 *    rechaza», que es exactamente el estado anterior: protegida e inalcanzable.
 *  - **El mecanismo que queda sigue siendo obligatorio.** Retirar las rutas no
 *    puede relajar RN-20: un rol administrativo con `aal1` sigue sin entrar.
 *    Sin esta segunda mitad, la retirada podría haber abierto un agujero y la
 *    suite lo habría dado por bueno.
 */
let app: INestApplication;
let firmante: Firmante;

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
});
afterAll(async () => {
  await app?.close();
});

describe('las rutas de MFA propias ya no existen', () => {
  it('no queda ninguna ruta de INSCRIPCIÓN ni de VERIFICACIÓN propias', () => {
    // Las dos que ADR-008 retiró. Las de `mfa/codigos` y `mfa/recuperacion` que
    // añadió la 09-A son otra cosa: no emiten `aal2` ni verifican un TOTP —eso
    // lo sigue haciendo Supabase—, gestionan los códigos de recuperación que
    // Supabase no ofrece.
    const rutas = enumerarRutas(app).map((r) => r.ruta);
    expect(rutas).not.toContain('/auth/mfa/inscripcion');
    expect(rutas).not.toContain('/auth/mfa/verificacion');
  });

  it('/auth expone exactamente dos rutas, y ninguna es de segundo factor', () => {
    // La lista es exhaustiva a propósito: comprobar solo que «no hay /auth/mfa»
    // dejaría entrar cualquier otra ruta nueva sin que nadie la revisara.
    const auth = enumerarRutas(app)
      .filter((r) => r.ruta.startsWith('/auth'))
      .map((r) => `${r.metodo} ${r.ruta}`)
      .sort();
    expect(auth).toEqual([
      'GET /auth/sesion',
      'POST /auth/mfa/codigos',
      'POST /auth/mfa/recuperacion',
      'POST /auth/restablecimiento',
    ]);
  });

  it('un POST a la ruta retirada devuelve 404, no 401 ni 403', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    const res = await request(app.getHttpServer())
      .post('/auth/mfa/verificacion')
      .set('Authorization', `Bearer ${token}`)
      .send({ codigo: '123456' });
    expect(res.status).toBe(404);
  });
});

describe('la retirada NO relaja RN-20 ni CA-25', () => {
  it.each(['superadministrador', 'administrador', 'operador_central'] as const)(
    '%s con aal1 sigue sin entrar',
    async (rol) => {
      const token = await tokenDe(firmante, { rol, aal: 'aal1', copropiedades: [COP_A] });
      const res = await request(app.getHttpServer())
        .get('/auth/sesion')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    },
  );

  it('con aal2 sí entra, y la sesión declara el segundo factor verificado', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    const res = await request(app.getHttpServer())
      .get('/auth/sesion')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.mfaVerificado).toBe(true);
  });

  it('portero y residente no necesitan segundo factor', async () => {
    for (const rol of ['portero', 'residente'] as const) {
      const token = await tokenDe(firmante, { rol, aal: 'aal1', copropiedadId: COP_A });
      const res = await request(app.getHttpServer())
        .get('/auth/sesion')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status, rol).toBe(200);
      expect(res.body.mfaVerificado, rol).toBe(false);
    }
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';

/**
 * RN-20 / CA-25 · el segundo factor es obligatorio para los roles
 * administrativos, **sin interruptor que lo apague**.
 *
 * **De dónde viene esta suite.** Antes se llamaba `mfa-interruptor` y probaba
 * las dos posiciones de `MFA_OBLIGATORIO`, una desviación declarada que se puso
 * para desbloquear al cliente. El interruptor se retiró entero el 2026-09-10
 * —variable, ramas del guard, mensajes y `.env.example`— en cuanto se
 * demostró que el ciclo del segundo factor funciona; lo que le bloqueaba era
 * otra cosa, la URL del JWKS (D-60).
 *
 * **Lo que se conserva, y por qué.** De los dos modos de fallo de un control de
 * seguridad, el peligroso no es el obvio:
 *
 *  1. Que apagado no apague — molesto, se descubre enseguida.
 *  2. Que **encendido no encienda** — una API que cree exigir segundo factor y
 *     no lo exige. Ese no se descubre nunca, porque nadie prueba lo que da por
 *     hecho.
 *
 * Retirado el interruptor, el segundo modo es el único que queda, y es
 * precisamente el que hay que seguir vigilando. Por eso estas pruebas siguen
 * aquí en vez de borrarse con la variable.
 */
let firmante: Firmante;
let app: INestApplication;

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
});
afterAll(async () => {
  await app?.close();
});

const sesion = (token: string) =>
  request(app.getHttpServer()).get('/auth/sesion').set('Authorization', `Bearer ${token}`);

describe('el segundo factor se exige, y no hay entorno que lo evite', () => {
  it('un rol administrativo con aal1 NO entra (RN-20, CA-25)', async () => {
    const token = await tokenDe(firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
    });
    await sesion(token).expect(401);
  });

  it('el superadministrador tampoco: no hay rol exento', async () => {
    const token = await tokenDe(firmante, {
      rol: 'superadministrador',
      copropiedadId: null,
      aal: 'aal1',
    });
    await sesion(token).expect(401);
  });

  it('y con aal2 sí entra: el rechazo era por el nivel, no por otra cosa', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    await sesion(token).expect(200);
  });

  it('la sesión declara mfaVerificado=true solo cuando el token trae aal2', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    const res = await sesion(token).expect(200);
    expect((res.body as { mfaVerificado: boolean }).mfaVerificado).toBe(true);
  });

  it('ninguna variable de entorno relaja la regla', async () => {
    /**
     * El control que impide que el interruptor vuelva por la puerta de atrás.
     * Se arranca una app pidiéndole explícitamente que acepte `aal1` con los
     * nombres que tuvo la desviación; la configuración ya no los conoce, así
     * que la regla se aplica igual. Si alguien reintrodujera la variable, esta
     * prueba pasaría a fallar y habría que venir aquí a justificarlo.
     */
    const conIntento = await crearApp(firmante, undefined, {
      MFA_OBLIGATORIO: false,
      MFA_REQUERIDO: false,
    } as never);
    const token = await tokenDe(firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
    });
    await request(conIntento.getHttpServer())
      .get('/auth/sesion')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    await conIntento.close();
  });
});

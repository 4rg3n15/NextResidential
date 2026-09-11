import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { AuditoriaEnMemoria } from '../src/comun/auditoria';

/**
 * §2.7.8 · el restablecimiento de contraseña deja rastro auditable.
 *
 * El cambio en sí lo ejecuta Supabase (ADR-008); lo que se comprueba aquí es
 * que el hecho llega a `auditoria_seguridad` y que la exención de segundo
 * factor que lo hace posible **no abre nada más**.
 */
let app: INestApplication;
let firmante: Firmante;
let auditoria: AuditoriaEnMemoria;

beforeAll(async () => {
  firmante = await crearFirmante();
  app = await crearApp(firmante);
  auditoria = app.get(AuditoriaEnMemoria);
});
afterAll(async () => {
  await app?.close();
});

const registrar = async (token: string) =>
  request(app.getHttpServer())
    .post('/auth/restablecimiento')
    .set('Authorization', `Bearer ${token}`)
    .set('User-Agent', 'consola-de-prueba/1.0');

describe('POST /auth/restablecimiento', () => {
  it('un administrador con la sesión aal1 del correo SÍ puede registrar el suyo', async () => {
    // Es el caso que motiva la exención: acaba de demostrar el control del
    // buzón, no el del segundo factor. Sin `@SinSegundoFactor()` recibiría 401
    // y su restablecimiento quedaría sin rastro.
    const antes = auditoria.restablecimientos.length;
    const token = await tokenDe(firmante, {
      rol: 'administrador',
      copropiedadId: COP_A,
      aal: 'aal1',
      usuarioId: '00000000-0000-4000-8000-0000000000c1',
    });
    expect((await registrar(token)).status).toBe(204);
    expect(auditoria.restablecimientos.length).toBe(antes + 1);
    expect(auditoria.restablecimientos.at(-1)).toMatchObject({
      usuarioId: '00000000-0000-4000-8000-0000000000c1',
      rol: 'administrador',
      userAgent: 'consola-de-prueba/1.0',
    });
  });

  it('la identidad sale del TOKEN, no del cuerpo', async () => {
    // Un cuerpo con «quién restableció» sería un cuerpo que el cliente
    // controla, y entonces la auditoría no significaría nada. El endpoint no
    // acepta cuerpo: el `ValidationPipe` rechaza cualquier campo no declarado.
    const token = await tokenDe(firmante, {
      rol: 'residente',
      copropiedadId: COP_A,
      usuarioId: '00000000-0000-4000-8000-0000000000c2',
    });
    const res = await request(app.getHttpServer())
      .post('/auth/restablecimiento')
      .set('Authorization', `Bearer ${token}`)
      .send({ usuarioId: '00000000-0000-4000-8000-00000000dead' });
    expect(res.status).toBe(204);
    expect(auditoria.restablecimientos.at(-1)?.usuarioId).toBe(
      '00000000-0000-4000-8000-0000000000c2',
    );
  });

  it('sin token no se registra nada', async () => {
    const antes = auditoria.restablecimientos.length;
    const res = await request(app.getHttpServer()).post('/auth/restablecimiento');
    expect(res.status).toBe(401);
    expect(auditoria.restablecimientos.length).toBe(antes);
  });

  it('la identidad de servicio no puede registrar restablecimientos', async () => {
    // No es una persona y no tiene contraseña que restablecer. Admitirla sería
    // dejar que el Edge escribiera en la auditoría de seguridad.
    const token = await tokenDe(firmante, { rol: 'servicio', copropiedadId: COP_A, aal: 'aal1' });
    expect((await registrar(token)).status).toBe(403);
  });

  it('el portero, que no exige segundo factor, también registra el suyo', async () => {
    const token = await tokenDe(firmante, { rol: 'portero', copropiedadId: COP_A, aal: 'aal1' });
    expect((await registrar(token)).status).toBe(204);
  });
});

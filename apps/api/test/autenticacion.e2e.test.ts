import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';

let app: INestApplication;
let f: Firmante;

beforeAll(async () => {
  f = await crearFirmante();
  app = await crearApp(f);
});
afterAll(async () => {
  await app?.close();
});

const sesion = (token?: string) => {
  const p = request(app.getHttpServer()).get('/auth/sesion');
  return token ? p.set('Authorization', `Bearer ${token}`) : p;
};

describe('verificación asimétrica del JWT', () => {
  it('acepta un token bien firmado', async () => {
    const res = await sesion(await tokenDe(f, { rol: 'administrador' }));
    expect(res.status).toBe(200);
    expect(res.body.copropiedadId).toBe(COP_A);
  });

  it('RECHAZA HS256 — no hay secreto compartido y aceptarlo abriría la confusión de algoritmos', async () => {
    const { SignJWT } = await import('jose');
    const token = await new SignJWT({
      sub: 'x',
      usuario_id: '00000000-0000-4000-8000-000000000010',
      rol: 'administrador',
      aal: 'aal2',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('https://proyecto-de-prueba.invalid/auth/v1')
      .setAudience('authenticated')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('secreto-que-no-deberia-servir-jamas'));
    expect((await sesion(token)).status).toBe(401);
  });

  it('rechaza `alg: none`', async () => {
    const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const carga = Buffer.from(
      JSON.stringify({
        sub: 'x',
        usuario_id: '00000000-0000-4000-8000-000000000010',
        rol: 'superadministrador',
        aal: 'aal2',
        exp: Math.floor(Date.now() / 1000) + 300,
        iss: 'https://proyecto-de-prueba.invalid/auth/v1',
        aud: 'authenticated',
      }),
    ).toString('base64url');
    expect((await sesion(`${cabecera}.${carga}.`)).status).toBe(401);
  });

  it('rechaza token expirado, incluso dentro de la tolerancia declarada', async () => {
    const token = await f.emitir(
      {
        sub: 'x',
        usuario_id: '00000000-0000-4000-8000-000000000010',
        rol: 'administrador',
        aal: 'aal2',
      },
      { exp: Math.floor(Date.now() / 1000) - 3600 },
    );
    expect((await sesion(token)).status).toBe(401);
  });

  it('rechaza emisor y audiencia ajenos', async () => {
    const base = {
      sub: 'x',
      usuario_id: '00000000-0000-4000-8000-000000000010',
      rol: 'administrador',
      aal: 'aal2',
    };
    expect(
      (await sesion(await f.emitir(base, { iss: 'https://otro-proyecto.invalid/auth/v1' }))).status,
    ).toBe(401);
    expect((await sesion(await f.emitir(base, { aud: 'otra-audiencia' }))).status).toBe(401);
  });

  it('rechaza claims con forma inesperada aunque la firma sea válida', async () => {
    const token = await f.emitir({
      sub: 'x',
      usuario_id: 'no-es-uuid',
      rol: 'inventado',
      aal: 'aal2',
    });
    expect((await sesion(token)).status).toBe(401);
  });

  it('el rechazo no revela el motivo al cliente', async () => {
    const res = await sesion(
      await f.emitir(
        {
          sub: 'x',
          usuario_id: '00000000-0000-4000-8000-000000000010',
          rol: 'administrador',
          aal: 'aal2',
        },
        { exp: Math.floor(Date.now() / 1000) - 3600 },
      ),
    );
    expect(JSON.stringify(res.body)).not.toMatch(/EXPIRAD|FIRMA|KID|ALGORITMO/i);
  });
});

describe('MFA obligatorio para roles administrativos (RN-20, CA-25)', () => {
  it.each(['superadministrador', 'administrador', 'operador_central'] as const)(
    '%s con aal1 no entra',
    async (rol) => {
      expect(
        (await sesion(await tokenDe(f, { rol, aal: 'aal1', copropiedades: [COP_A] }))).status,
      ).toBe(401);
    },
  );

  it.each(['portero', 'residente'] as const)('%s no necesita segundo factor', async (rol) => {
    expect((await sesion(await tokenDe(f, { rol, aal: 'aal1' }))).status).toBe(200);
  });
});

describe('RBAC declarativo', () => {
  it('una identidad de servicio no entra en /auth/sesion', async () => {
    expect((await sesion(await tokenDe(f, { rol: 'servicio', aal: 'aal1' }))).status).toBe(403);
  });

  it('sin cabecera Authorization → 401', async () => {
    expect((await sesion()).status).toBe(401);
  });

  it('esquema distinto de Bearer → 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/sesion')
      .set('Authorization', 'Basic YWxhZGRpbjpvcGVuc2VzYW1l');
    expect(res.status).toBe(401);
  });
});

describe('salud', () => {
  it('/health y /ready son públicas', async () => {
    expect((await request(app.getHttpServer()).get('/health')).status).toBe(200);
    expect((await request(app.getHttpServer()).get('/ready')).status).toBe(200);
  });
});

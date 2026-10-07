import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { ADMINISTRADOR_DE_CUENTAS, PROVEEDOR_DE_IDENTIDAD } from '../src/cuentas';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import { ProveedorDeIdentidadFalso } from './dobles/proveedor-de-identidad';
import { URL_BASE, exigirBase } from './base-exigida';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C9 (15-M) · BAJA DE UN RESIDENTE CONTRA LA BASE REAL
 *
 *   alta → primer ingreso → baja con motivo por el superadministrador →
 *   la cuenta, su rol y su constancia quedan inactivos y auditados (RN-19) →
 *   el gancho de claims YA NO EMITE tokens para esa cuenta (sesión revocada:
 *   ningún refresco ni ingreso nuevo prospera) → repetir la baja es 404 →
 *   otra copropiedad no puede darla de baja (RN-15).
 *
 * Sólo el proveedor de identidad es falso; los claims salen del gancho de la
 * base, que es exactamente el que Supabase Auth ejecuta al emitir un token.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SUPER = '00000000-0000-4000-8000-000000000001';
const INICIAL = 'Inicial#2026';
const SUFIJO = String(Date.now()).slice(-7);

let pool: Pool | undefined;
let app: INestApplication | undefined;
let disponible = false;
let superadmin = '';
let proveedor: ProveedorDeIdentidadFalso | undefined;

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    await pool.query('SELECT 1 FROM public.bitacora_de_residentes LIMIT 1');
    disponible = true;
  } catch {
    disponible = false;
    return;
  }
  const firmante = await crearFirmante();
  proveedor = new ProveedorDeIdentidadFalso(firmante, async (authUserId) => {
    const { rows } = await (pool as Pool).query<{ c: Record<string, unknown> }>(
      `SELECT public.custom_access_token_hook(jsonb_build_object('user_id', $1::text, 'claims', '{}'::jsonb)) -> 'claims' AS c`,
      [authUserId],
    );
    return rows[0]?.c ?? null;
  });
  const doble = proveedor;
  app = await crearApp(
    firmante,
    (b) =>
      b
        .overrideProvider(PROVEEDOR_DE_IDENTIDAD)
        .useValue(doble)
        .overrideProvider(ADMINISTRADOR_DE_CUENTAS)
        .useValue(doble),
    {
      PERSISTENCIA_DE_EVENTOS: 'postgres',
      PERSISTENCIA_DE_BIOMETRIA: 'postgres',
      DATABASE_URL: URL_BASE,
      DATABASE_POOLER_URL: URL_BASE,
    },
  );
  superadmin = await tokenDe(firmante, {
    rol: 'superadministrador',
    copropiedadId: null,
    usuarioId: SUPER,
  });
});

afterAll(async () => {
  await app?.close();
  await pool?.end();
});

exigirBase('sin DATABASE_URL_PRUEBAS o sin la migración 0038', () => disponible);
const omitida = (): boolean => !disponible;

const http = () => request((app as INestApplication).getHttpServer());
const comoSuper = (metodo: 'get' | 'post', ruta: string) =>
  http()[metodo](ruta).set('Authorization', `Bearer ${superadmin}`);
const uno = async <T extends object>(sql: string, p: unknown[]): Promise<T | undefined> =>
  (await (pool as Pool).query<T>(sql, p)).rows[0];

/** El código corto de A: el que tenga, o uno asignado por la ruta de configuración (D1). */
const CODIGO_DE_A = async (): Promise<string> => {
  const fila = await uno<{ codigo: string | null }>(
    'SELECT codigo_corto AS codigo FROM public.copropiedades WHERE id = $1',
    [COP_A],
  );
  if (fila?.codigo !== null && fila?.codigo !== undefined) return fila.codigo;
  const codigo = `B${SUFIJO.slice(-5)}`;
  const r = await http()
    .patch(`/copropiedades/${COP_A}/configuracion`)
    .set('Authorization', `Bearer ${superadmin}`)
    .send({ codigoCorto: codigo });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return codigo;
};

describe('C9 · baja de un residente con motivo (RN-19, CA-02)', () => {
  const usuario = `baja${SUFIJO}`;
  let usuarioId = '';
  let viviendaId = '';

  it('alta por el superadministrador y primer ingreso: la cuenta vive', async () => {
    if (omitida()) return;
    // 15-W (D1) · la cuenta nace con su vivienda: una propia, activa y sin titular.
    const vivienda = await uno<{ id: string }>(
      `INSERT INTO public.viviendas (copropiedad_id, identificador, agrupacion, creado_por, actualizado_por)
       VALUES ($1, $2, 'C9', $3, $3) RETURNING id`,
      [COP_A, `B${SUFIJO}`, SUPER],
    );
    viviendaId = vivienda?.id ?? '';
    const alta = await comoSuper('post', `/copropiedades/${COP_A}/residentes/cuentas`).send({
      usuario,
      contrasenaInicial: INICIAL,
      nombre: `Residente de baja ${SUFIJO}`,
      viviendaId,
    });
    expect(alta.status, JSON.stringify(alta.body)).toBe(201);
    usuarioId = alta.body.usuarioId as string;
    const acceso = await http()
      .post('/auth/acceso')
      .set('x-ncr-origen', '198.51.100.77')
      .send({ codigo: await CODIGO_DE_A(), usuario, contrasena: INICIAL });
    expect(acceso.status, JSON.stringify(acceso.body)).toBe(200);
    // Con su titular activo, la vivienda ya no se ofrece a otra primera cuenta.
    const libres = await comoSuper(
      'get',
      `/copropiedades/${COP_A}/residentes/viviendas-sin-titular?q=B${SUFIJO}`,
    );
    expect((libres.body as { id: string }[]).map((v) => v.id)).not.toContain(viviendaId);
  });

  it('sin motivo (o con uno de menos de 5 letras) no hay baja: 400 con palabras', async () => {
    if (omitida()) return;
    const sin = await comoSuper(
      'post',
      `/copropiedades/${COP_A}/residentes/cuentas/${usuarioId}/baja`,
    ).send({});
    expect(sin.status).toBe(400);
    const corto = await comoSuper(
      'post',
      `/copropiedades/${COP_A}/residentes/cuentas/${usuarioId}/baja`,
    ).send({ motivo: 'x' });
    expect(corto.status).toBe(400);
    expect(JSON.stringify(corto.body)).toMatch(/al menos 5 caracteres/);
  });

  it('otra copropiedad no la da de baja (RN-15): 403 o 404, y la cuenta sigue activa', async () => {
    if (omitida()) return;
    const ajena = await comoSuper(
      'post',
      `/copropiedades/${COP_B}/residentes/cuentas/${usuarioId}/baja`,
    ).send({ motivo: 'Intento desde otra copropiedad' });
    expect([403, 404]).toContain(ajena.status);
    const fila = await uno<{ estado: string }>('SELECT estado FROM public.usuarios WHERE id = $1', [
      usuarioId,
    ]);
    expect(fila?.estado).toBe('activo');
  });

  it('la baja deja cuenta, rol y constancia; y la sesión queda revocada: no se emiten más tokens', async () => {
    if (omitida()) return;
    const baja = await comoSuper(
      'post',
      `/copropiedades/${COP_A}/residentes/cuentas/${usuarioId}/baja`,
    ).send({ motivo: 'Se mudó de la copropiedad' });
    expect(baja.status, JSON.stringify(baja.body)).toBe(200);
    expect(baja.body).toMatchObject({ dadaDeBaja: true, plantillasSuprimidas: 0 });

    const cuenta = await uno<{ estado: string; motivo: string | null; por: string | null }>(
      `SELECT estado, motivo_desactivacion AS motivo, desactivado_por AS por
         FROM public.usuarios WHERE id = $1`,
      [usuarioId],
    );
    expect(cuenta).toMatchObject({ estado: 'inactivo', motivo: 'Se mudó de la copropiedad' });
    expect(cuenta?.por).toBe(SUPER);
    const rol = await uno<{ estado: string }>(
      `SELECT estado FROM public.roles_usuario WHERE usuario_id = $1 AND rol = 'residente'`,
      [usuarioId],
    );
    expect(rol?.estado).toBe('inactivo');
    const constancia = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.auditoria_seguridad
        WHERE recurso = 'residentes/baja' AND usuario_id = $1 AND copropiedad_id_objetivo = $2`,
      [SUPER, COP_A],
    );
    expect(Number(constancia?.n ?? '0')).toBeGreaterThan(0);

    // El gancho de claims —el mismo que Supabase ejecuta al refrescar— ya no
    // emite para esta cuenta: ingresar con la contraseña vigente da 401.
    const acceso = await http()
      .post('/auth/acceso')
      .set('x-ncr-origen', '198.51.100.78')
      .send({ codigo: await CODIGO_DE_A(), usuario, contrasena: INICIAL });
    // 401 o 403: lo que importa es que NO sale token. (403 = el gancho
    // rechazó la cuenta inactiva; 401 = el proveedor no la reconoce.)
    expect([401, 403]).toContain(acceso.status);
    expect(JSON.stringify(acceso.body)).not.toContain('accessToken');

    // La lista la enseña «de baja», no la borra (RN-19).
    const lista = await comoSuper('get', `/copropiedades/${COP_A}/residentes/cuentas`);
    const fila = (lista.body as { usuarioId: string; activa: boolean }[]).find(
      (c) => c.usuarioId === usuarioId,
    );
    expect(fila?.activa).toBe(false);

    // 15-W (D1) · un titular dado de baja no deja la vivienda bloqueada: vuelve a
    // estar sin titular y la administración puede entregar otra primera cuenta.
    const libres = await comoSuper(
      'get',
      `/copropiedades/${COP_A}/residentes/viviendas-sin-titular?q=B${SUFIJO}`,
    );
    expect(libres.status, JSON.stringify(libres.body)).toBe(200);
    expect((libres.body as { id: string }[]).map((v) => v.id)).toContain(viviendaId);
  });

  it('repetir la baja es 404: ya no hay residente activo con ese identificador', async () => {
    if (omitida()) return;
    const otra = await comoSuper(
      'post',
      `/copropiedades/${COP_A}/residentes/cuentas/${usuarioId}/baja`,
    ).send({ motivo: 'Segunda vez, por error' });
    expect(otra.status).toBe(404);
  });
});

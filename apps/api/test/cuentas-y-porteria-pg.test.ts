import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { RELOJ } from '@ncr/domain-core';
import { ADMINISTRADOR_DE_CUENTAS, PROVEEDOR_DE_IDENTIDAD } from '../src/cuentas';
import { franjaDe } from '../src/porteria';
import { SesionesPg } from '../src/porteria/infraestructura/sesiones-pg';
import { COP_A, COP_B, crearApp, crearFirmante, tokenDe } from './utilidades';
import { ProveedorDeIdentidadFalso } from './dobles/proveedor-de-identidad';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ETAPA 15-H · LA MISMA CADENA, CONTRA LA BASE REAL
 *
 * Repositorios PostgreSQL (`PERSISTENCIA_DE_EVENTOS=postgres`), RLS forzada,
 * disparadores y el GANCHO de claims de la base: los claims del token salen de
 * `custom_access_token_hook`, no de un doble. Sólo el proveedor de identidad es
 * falso, porque la suite no alcanza Supabase Auth.
 *
 * Se OMITE sin `DATABASE_URL_PRUEBAS`, y lo dice: una omisión no es un verde.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const NIT_MIRA = '900123456';
const SUPER = '00000000-0000-4000-8000-000000000001';
const INICIAL = 'Inicial#2026';
const NUEVA = 'Garita#2026x';
const SUFIJO = String(Date.now()).slice(-8);

let pool: Pool | undefined;
let app: INestApplication | undefined;
let disponible = false;
let instante = new Date('2026-09-26T02:00:00Z');
let proveedor: ProveedorDeIdentidadFalso;
let superadmin = '';

beforeAll(async () => {
  if (URL_BASE === undefined || URL_BASE === '') return;
  pool = new Pool({ connectionString: URL_BASE, max: 4 });
  try {
    await pool.query('SELECT 1 FROM public.bitacora_de_porteria LIMIT 1');
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
  app = await crearApp(
    firmante,
    (b) =>
      b
        .overrideProvider(PROVEEDOR_DE_IDENTIDAD)
        .useValue(proveedor)
        .overrideProvider(ADMINISTRADOR_DE_CUENTAS)
        .useValue(proveedor)
        .overrideProvider(RELOJ)
        .useValue({ ahora: () => new Date(instante.getTime()) }),
    { PERSISTENCIA_DE_EVENTOS: 'postgres', DATABASE_URL: URL_BASE, DATABASE_POOLER_URL: URL_BASE },
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

const omitida = (): boolean => {
  if (disponible) return false;
  console.log(
    'OMITIDA: sin DATABASE_URL_PRUEBAS o sin la migración 0037. Se ejecuta con --con-base.',
  );
  return true;
};

const http = () => request((app as INestApplication).getHttpServer());
const acceso = (usuario: string, contrasena: string) =>
  http()
    .post('/auth/acceso')
    .set('x-ncr-origen', '203.0.113.9')
    .send({ nit: NIT_MIRA, usuario, contrasena });
/** El `session_id` del token: con él se localiza SU fila, no la de otra sesión del mismo portero. */
const sesionDe = (jwt: string): string =>
  (
    JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      session_id: string;
    }
  ).session_id;
const uno = async <T extends object>(sql: string, p: unknown[]): Promise<T | undefined> =>
  (await (pool as Pool).query<T>(sql, p)).rows[0];

describe('cuentas y portería contra la base real (15-H)', () => {
  const usuario = `pg.porteria.${SUFIJO}`;
  let porteroId = '';
  let token = '';

  it('el alta escribe la cuenta SIN correo, con el cambio obligatorio y su perfil', async () => {
    if (omitida()) return;
    const r = await http()
      .post(`/copropiedades/${COP_A}/porteros`)
      .set('Authorization', `Bearer ${superadmin}`)
      .send({
        usuario,
        contrasenaInicial: INICIAL,
        nombre: 'Portero de la base',
        porteria: 'Norte',
        sectores: ['Finca 3'],
      });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    porteroId = r.body.usuarioId;
    const fila = await uno<{
      correo: string | null;
      nombre_usuario: string;
      debe: boolean;
      creado_por: string;
    }>(
      `SELECT correo::text AS correo, nombre_usuario::text AS nombre_usuario, debe_cambiar_contrasena AS debe, creado_por
         FROM public.usuarios WHERE id = $1`,
      [porteroId],
    );
    expect(fila).toEqual({ correo: null, nombre_usuario: usuario, debe: true, creado_por: SUPER });
    const sinteticos = await uno<{ n: string }>(
      `SELECT count(*)::text AS n FROM public.usuarios WHERE correo::text LIKE '%.usuarios.ncr.invalid'`,
      [],
    );
    expect(sinteticos?.n).toBe('0');
    expect(
      await uno(`SELECT porteria FROM public.perfiles_de_portero WHERE usuario_id = $1`, [
        porteroId,
      ]),
    ).toEqual({ porteria: 'Norte' });
  });

  it('la franja que calcula la BASE coincide con la del dominio, cruzando la medianoche', async () => {
    if (omitida()) return;
    const r = await http()
      .post(`/copropiedades/${COP_A}/turnos`)
      .set('Authorization', `Bearer ${superadmin}`)
      .send({
        porteroId,
        dia: '2026-09-25',
        horaInicio: '22:00',
        horaFin: '06:00',
        tipo: 'programado',
      });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const dominio = franjaDe('2026-09-25', '22:00', '06:00', 'America/Bogota');
    const f = await uno<{ inicio: Date; fin: Date }>(
      'SELECT lower(franja) AS inicio, upper(franja) AS fin FROM public.turnos_de_porteria WHERE id = $1',
      [r.body.turno.id],
    );
    expect(f?.inicio.toISOString()).toBe(dominio.inicio.toISOString());
    expect(f?.fin.toISOString()).toBe(dominio.fin.toISOString());
  });

  it('antes del turno no entra; dentro sí, y el gancho de la base marca el primer ingreso', async () => {
    if (omitida()) return;
    expect((await acceso(usuario, INICIAL)).status).toBe(403);
    instante = new Date('2026-09-26T03:00:00Z');
    const r = await acceso(usuario, INICIAL);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.debeCambiarContrasena).toBe(true);
    token = r.body.accessToken;
    expect(
      (await http().get('/porteria/sesion').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(403);
  });

  it('cambiada la contraseña, la base apaga el indicador y el gancho deja de emitirlo', async () => {
    if (omitida()) return;
    const r = await http()
      .post('/auth/contrasena')
      .set('Authorization', `Bearer ${token}`)
      .send({ actual: INICIAL, nueva: NUEVA });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(
      await uno('SELECT debe_cambiar_contrasena AS debe FROM public.usuarios WHERE id = $1', [
        porteroId,
      ]),
    ).toEqual({ debe: false });
    const nuevo = await acceso(usuario, NUEVA);
    expect(nuevo.body.debeCambiarContrasena).toBe(false);
    token = nuevo.body.accessToken;
  });

  it('la sesión queda registrada con el código SOLO en hash, y el patrullaje vive en la base', async () => {
    if (omitida()) return;
    const estado = await http().get('/porteria/sesion').set('Authorization', `Bearer ${token}`);
    const codigo = estado.body.codigo as string;
    expect(codigo).toMatch(/^\d{4}$/);
    const s = await uno<{ hash: string; estado: string; origen: string }>(
      `SELECT codigo_hash AS hash, estado, origen_declarado AS origen FROM public.sesiones_de_porteria
        WHERE sesion_id = $1`,
      [sesionDe(token)],
    );
    expect(s?.hash.startsWith('scrypt$')).toBe(true);
    expect(s?.hash).not.toContain(codigo);
    expect(s?.origen).toBe('203.0.113.9');

    await http()
      .post('/porteria/sesion/patrullaje')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      await uno('SELECT estado FROM public.sesiones_de_porteria WHERE sesion_id = $1', [
        sesionDe(token),
      ]),
    ).toEqual({ estado: 'patrullaje' });
    expect(
      (
        await http()
          .get(`/copropiedades/${COP_A}/guardia/ordenes`)
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(423);
    const mal = String((Number(codigo) + 1) % 10_000).padStart(4, '0');
    expect(
      (
        await http()
          .post('/porteria/sesion/desbloqueo')
          .set('Authorization', `Bearer ${token}`)
          .send({ codigo: mal })
      ).body.resultado,
    ).toBe('incorrecto');
    expect(
      await uno(
        'SELECT intentos_fallidos AS n FROM public.sesiones_de_porteria WHERE sesion_id = $1',
        [sesionDe(token)],
      ),
    ).toEqual({ n: 1 });
    expect(
      (
        await http()
          .post('/porteria/sesion/desbloqueo')
          .set('Authorization', `Bearer ${token}`)
          .send({ codigo })
      ).body.resultado,
    ).toBe('desbloqueada');
    expect(
      (
        await http()
          .get(`/copropiedades/${COP_A}/guardia/ordenes`)
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(200);
  });

  it('por el camino de SERVICIO, otra copropiedad no ve la sesión (RLS, segundo camino)', async () => {
    if (omitida()) return;
    const repo = new SesionesPg(pool as Pool);
    expect(await repo.de(COP_A, sesionDe(token))).not.toBeNull();
    expect(await repo.de(COP_B, sesionDe(token))).toBeNull();
  });

  it('al terminar el turno la sesión se cierra EN LA BASE, con motivo, y queda en la bitácora', async () => {
    if (omitida()) return;
    instante = new Date('2026-09-26T11:00:00Z');
    expect(
      (
        await http()
          .get(`/copropiedades/${COP_A}/guardia/ordenes`)
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(403);
    const cerrada = await uno<{ motivo: string }>(
      'SELECT motivo_cierre AS motivo FROM public.sesiones_de_porteria WHERE sesion_id = $1',
      [sesionDe(token)],
    );
    expect(cerrada?.motivo).toBe('fin_de_turno');
    const tipos = (
      await (pool as Pool).query<{ tipo: string }>(
        'SELECT tipo FROM public.bitacora_de_porteria WHERE usuario_id = $1 ORDER BY ocurrido_en',
        [porteroId],
      )
    ).rows.map((f) => f.tipo);
    for (const t of [
      'alta_de_portero',
      'turno_asignado',
      'acceso_rechazado',
      'inicio_de_sesion',
      'cambio_de_contrasena',
      'inicio_de_patrullaje',
      'codigo_incorrecto',
      'fin_de_patrullaje',
      'cierre_de_sesion',
    ]) {
      expect(tipos, t).toContain(t);
    }
  });

  it('la bitácora rechaza UPDATE y DELETE también al DUEÑO de la tabla', async () => {
    if (omitida()) return;
    const cliente = await (pool as Pool).connect();
    try {
      const { rows } = await cliente.query<{ d: string }>(
        `SELECT pg_get_userbyid(relowner) AS d FROM pg_class WHERE relname = 'bitacora_de_porteria'`,
      );
      await cliente.query('BEGIN');
      await cliente.query(`SET LOCAL ROLE "${rows[0]?.d ?? 'postgres'}"`);
      await expect(
        cliente.query(
          `UPDATE public.bitacora_de_porteria SET detalle = 'x' WHERE usuario_id = $1`,
          [porteroId],
        ),
      ).rejects.toThrow(/permission denied|append-only/);
      await cliente.query('ROLLBACK');
      await cliente.query('BEGIN');
      await cliente.query(`SET LOCAL ROLE "${rows[0]?.d ?? 'postgres'}"`);
      await expect(
        cliente.query(`DELETE FROM public.bitacora_de_porteria WHERE usuario_id = $1`, [porteroId]),
      ).rejects.toThrow(/permission denied|prohibid/i);
      await cliente.query('ROLLBACK');
    } finally {
      cliente.release();
    }
  });
});

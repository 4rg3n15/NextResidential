import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { SalidaAplanada } from '@ncr/providers';
import type { ContextoTenant } from '../src/autenticacion';
import { RepositorioDePuntosPg } from '../src/equipos/infraestructura/puntos-de-acceso-pg';
import { BitacoraDeOrdenesPg } from '../src/guardia/infraestructura/bitacora-de-ordenes-pg';
import { URL_BASE, exigirBase } from './base-exigida';
import { horaDeLaOrden } from './hora-de-la-orden';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3 · LAS SALIDAS DEL VIDEOPORTERO CONTRA POSTGRESQL (0048)
 *
 * El repositorio de puntos escribe con los claims del ADMINISTRADOR —la RLS
 * forzada decide—, conserva el nombre editado, da de baja lo que el equipo ya
 * no declara y, con diez «Descubrir» a la vez, no duplica ninguna puerta: lo
 * garantiza el índice único parcial, no el código (ADR-04). La bitácora de
 * órdenes ata la orden al punto y lee su nombre por la clave ajena.
 *
 * Sobre el intercom del seed de MIRA. Las filas no se borran (RN-19): cada
 * corrida da de baja lo que dejó la anterior.
 *
 * Los repositorios hablan como `authenticated`: la base de pruebas se abre
 * como superusuario, que OMITE la RLS, y una prueba de políticas con la RLS
 * apagada pasaría con cualquier política. En Supabase el rol de conexión no es
 * superusuario y la RLS forzada lo alcanza (ADR-005).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const MIRA = '10000000-0000-4000-8000-000000000001';
const ROBLE = '10000000-0000-4000-8000-000000000002';
const INTERCOM = '90000000-0000-4000-8000-000000000004';
const ADMIN = '00000000-0000-4000-8000-000000000010';
const PORTERO = '00000000-0000-4000-8000-000000000011';
const OPERADOR = '00000000-0000-4000-8000-000000000012';
let pool: Pool | undefined;
/** El mismo servidor, como `authenticated`: lo que la RLS forzada alcanza. */
let app: Pool | undefined;
let disponible = false;

const ctx = (rol: ContextoTenant['rol'], usuarioId: string, cop: string): ContextoTenant =>
  ({
    rol,
    usuarioId,
    copropiedadId: cop,
    copropiedadesAtendidas: [cop],
    mfaVerificado: true,
  }) as unknown as ContextoTenant;
const admin = ctx('administrador', ADMIN, MIRA);

const salida = (n: number): SalidaAplanada => ({
  ruta: `equipo/propio/puerta-${String(n)}`,
  nombre: `Cerradura ${String(n)}`,
  numeroDePuerta: n,
  modulo: 'Salidas del equipo',
});

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    pool = new Pool({ connectionString: URL_BASE, max: 2 });
    app = new Pool({ connectionString: URL_BASE, max: 12, options: '-c role=authenticated' });
    const r = await pool.query<{ existe: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns
        WHERE table_name = 'puntos_de_acceso' AND column_name = 'numero_de_puerta') AS existe`,
    );
    disponible = r.rows[0]?.existe === true;
    if (!disponible) return;
    // Lo que dejó la corrida anterior, de baja (no se borra).
    const c = await pool.connect();
    try {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ rol: 'administrador', usuario_id: ADMIN, copropiedad_id: MIRA }),
      ]);
      await c.query(
        `UPDATE public.puntos_de_acceso SET estado = 'inactivo', desactivado_en = now(),
                desactivado_por = $2, motivo_desactivacion = 'limpieza de la prueba'
          WHERE dispositivo_id = $1 AND estado = 'activo'`,
        [INTERCOM, ADMIN],
      );
    } finally {
      c.release();
    }
  } catch {
    disponible = false;
  }
});
afterAll(async () => {
  await pool?.end();
  await app?.end();
});

describe('RepositorioDePuntosPg · contra PostgreSQL con RLS forzada', () => {
  exigirBase('sin DATABASE_URL_PRUEBAS o sin la migración 0048', () => disponible);

  it('descubre, conserva el nombre editado y da de baja lo que ya no se declara', async () => {
    if (!disponible) return;
    const repo = new RepositorioDePuntosPg(app as Pool);
    const dos = await repo.sincronizar(admin, MIRA, INTERCOM, [salida(1), salida(2)], new Date());
    expect(dos.map((p) => [p.numeroDePuerta, p.origen])).toEqual([
      [1, 'descubierto'],
      [2, 'descubierto'],
    ]);
    const uno = dos[0];
    const renombrado = await repo.renombrar(
      admin,
      MIRA,
      INTERCOM,
      uno?.id ?? '',
      'Portón peatonal',
    );
    expect(renombrado?.nombre).toBe('Portón peatonal');
    const despues = await repo.sincronizar(admin, MIRA, INTERCOM, [salida(1)], new Date());
    expect(despues.map((p) => [p.id, p.nombre])).toEqual([[uno?.id, 'Portón peatonal']]);
  });

  it('diez «Descubrir» a la vez: ninguna puerta duplicada (índice único parcial, ADR-04)', async () => {
    if (!disponible) return;
    const repo = new RepositorioDePuntosPg(app as Pool);
    const tres = [salida(1), salida(2), salida(3)];
    await Promise.all(
      Array.from({ length: 10 }, () => repo.sincronizar(admin, MIRA, INTERCOM, tres, new Date())),
    );
    const activos = await repo.listar(admin, MIRA, INTERCOM);
    expect(activos.map((p) => p.numeroDePuerta)).toEqual([1, 2, 3]);
  });

  it('el portero los lee y no los escribe; ROBLE ni los ve (KPI-35)', async () => {
    if (!disponible) return;
    const repo = new RepositorioDePuntosPg(app as Pool);
    const portero = ctx('portero', PORTERO, MIRA);
    expect((await repo.listar(portero, MIRA, INTERCOM)).length).toBeGreaterThan(0);
    await expect(
      repo.sincronizar(portero, MIRA, INTERCOM, [salida(4)], new Date()),
    ).rejects.toThrow(/row-level security/);
    const deRoble = ctx('operador_central', OPERADOR, ROBLE);
    expect(await repo.listar(deRoble, MIRA, INTERCOM)).toEqual([]);
    expect(await repo.renombrar(deRoble, MIRA, INTERCOM, randomUUID(), 'x')).toBeNull();
  });
});

describe('BitacoraDeOrdenesPg · la orden atada a su punto', () => {
  exigirBase('sin DATABASE_URL_PRUEBAS o sin la migración 0048', () => disponible);

  it('guarda punto y puerta, y el historial devuelve el NOMBRE del punto', async () => {
    if (!disponible) return;
    const puntos = await new RepositorioDePuntosPg(app as Pool).listar(admin, MIRA, INTERCOM);
    const punto = puntos.find((p) => p.numeroDePuerta === 2);
    expect(punto).toBeDefined();
    const bitacora = new BitacoraDeOrdenesPg(app as Pool);
    const id = randomUUID();
    await bitacora.registrar({
      id,
      copropiedadId: MIRA,
      accion: 'abrir',
      motivo: 'Visitante anunciado por el residente',
      operadorId: OPERADOR,
      rol: 'operador_central',
      dispositivoId: INTERCOM,
      momento: await horaDeLaOrden(pool as Pool, MIRA),
      eventoId: null,
      punto: { id: punto?.id ?? '', nombre: 'no se lee de aquí', numeroDePuerta: 2 },
    });
    await bitacora.anotarResultado(MIRA, id, 'aceptada', null);
    const leida = (await bitacora.ultimas(MIRA, 200)).find((o) => o.id === id);
    expect(leida?.punto).toEqual({ id: punto?.id, nombre: punto?.nombre, numeroDePuerta: 2 });
    expect(leida?.resultado).toBe('aceptada');
  });

  it('una orden de ROBLE no se ata a un punto de MIRA: la clave ajena es compuesta', async () => {
    if (!disponible) return;
    const puntos = await new RepositorioDePuntosPg(app as Pool).listar(admin, MIRA, INTERCOM);
    await expect(
      new BitacoraDeOrdenesPg(app as Pool).registrar({
        id: randomUUID(),
        copropiedadId: ROBLE,
        accion: 'abrir',
        motivo: 'Abrir la salida del vecino',
        operadorId: OPERADOR,
        rol: 'operador_central',
        dispositivoId: INTERCOM,
        momento: new Date(),
        eventoId: null,
        punto: { id: puntos[0]?.id ?? randomUUID(), nombre: 'x', numeroDePuerta: 1 },
      }),
    ).rejects.toThrow(/ordenes_manuales_punto_fk/);
  });
});

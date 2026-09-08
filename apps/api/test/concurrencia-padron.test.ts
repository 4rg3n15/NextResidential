import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { Placa, esExito } from '@ncr/domain-core';
import { RepositorioPadronPg } from '../src/padron/infraestructura/repositorio-pg';
import { RegistrarVehiculo } from '../src/padron/aplicacion/casos-de-uso';
import type { ContextoTenant } from '../src/autenticacion/dominio/claims';

/**
 * KPI-03 · ADR-04 · CA-03 — 100 inserciones SIMULTÁNEAS, 0 duplicados.
 *
 * Se ejecuta contra una base REAL a través del caso de uso, no contra un doble.
 * Un repositorio simulado no puede demostrar esto: la garantía la da el índice
 * único parcial de PostgreSQL, y un doble en memoria demostraría únicamente
 * que el doble está bien escrito.
 *
 * Cien conexiones de verdad, no cien promesas sobre una: `Promise.all` sobre
 * un solo cliente las serializaría y la prueba pasaría sin haber probado nada.
 *
 * Se OMITE —no falla— si no hay base: el entorno del usuario no tiene
 * PostgreSQL local (ETAPA 14 la lleva a CI). Cuando se omite, lo dice.
 */
const URL_BASE = process.env.DATABASE_URL_PRUEBAS;
const COP = '10000000-0000-4000-8000-000000000001';

let pool: Pool | undefined;
let disponible = false;
let viviendaId = '';
let actorId = '';

const ctx: ContextoTenant = {
  usuarioId: '',
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};

beforeAll(async () => {
  if (!URL_BASE) return;
  try {
    pool = new Pool({ connectionString: URL_BASE, max: 120 });
    const c = await pool.connect();
    // La RLS está FORZADA y alcanza también al dueño: sin claims esta consulta
    // devuelve cero filas y la prueba se omitiría creyendo que no hay base.
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({
        rol: 'administrador',
        usuario_id: '00000000-0000-4000-8000-000000000010',
        copropiedad_id: COP,
      }),
    ]);
    const v = await c.query<{ id: string }>(
      `SELECT id FROM public.viviendas WHERE copropiedad_id=$1 AND estado='activo' LIMIT 1`,
      [COP],
    );
    const u = await c.query<{ id: string }>(
      `SELECT id FROM public.usuarios WHERE copropiedad_id=$1 LIMIT 1`,
      [COP],
    );
    c.release();
    viviendaId = v.rows[0]?.id ?? '';
    actorId = u.rows[0]?.id ?? '';
    disponible = Boolean(viviendaId && actorId);
  } catch {
    disponible = false;
  }
});

afterAll(async () => {
  await pool?.end();
});

describe('KPI-03 · integridad concurrente en la base (ADR-04)', () => {
  it('100 inserciones simultáneas de la misma placa producen exactamente una fila activa', async () => {
    if (!disponible) {
      console.warn(
        'OMITIDA: sin DATABASE_URL_PRUEBAS o sin semillas. Se ejecuta en CI (ETAPA 14).',
      );
      return;
    }
    // Placa ÚNICA por ejecución, con entropía de verdad.
    //
    // Antes era `CC${Date.now().toString().slice(-4)}X`: los cuatro últimos
    // dígitos del reloj en milisegundos se repiten cada diez segundos, así que
    // dos corridas seguidas contra la misma base podían toparse con la fila que
    // dejó la anterior — y como en `vehiculos` no hay borrado físico (RN-19),
    // esa fila no se va. La prueba habría dado 0 aceptados en vez de 1 sin que
    // nada estuviera roto. Lo destapó la revisión de intermitencias del
    // 2026-09-08, al pasar la suite a ejecutarse tres veces seguidas.
    const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const azar = Array.from(randomBytes(5), (b) => alfabeto[b % alfabeto.length]).join('');
    const placa = `C${azar}`;
    const p = Placa.crear(placa);
    expect(esExito(p)).toBe(true);

    const contexto = { ...ctx, usuarioId: actorId };
    const claims = {
      rol: 'administrador',
      usuario_id: actorId,
      copropiedad_id: COP,
    };

    const intentos = Array.from({ length: 100 }, () => {
      // Un repositorio por intento: cada uno toma su PROPIA conexión del pool.
      const repo = new RepositorioPadronPg(pool!, claims);
      return new RegistrarVehiculo(repo).ejecutar(contexto, { viviendaId, placa });
    });
    const resultados = await Promise.all(intentos);

    const aceptados = resultados.filter((r) => r.ok).length;
    const rechazados = resultados.length - aceptados;

    const c = await pool!.connect();
    await c.query("SELECT set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
    const { rows } = await c.query<{ n: string }>(
      `SELECT count(*)::text n FROM public.vehiculos
        WHERE copropiedad_id=$1 AND placa=$2 AND estado='activo'`,
      [COP, p.ok ? p.valor.valor : ''],
    );
    c.release();

    console.log(
      `  intentos: 100 · aceptados: ${aceptados} · rechazados: ${rechazados} · filas activas: ${rows[0]!.n}`,
    );
    expect(aceptados).toBe(1);
    expect(rechazados).toBe(99);
    expect(Number(rows[0]!.n)).toBe(1);
  }, 60_000);

  it('RN-19 · el adaptador no expone borrado físico', () => {
    // La ausencia se comprueba, no se afirma: `DELETE` no aparece en el
    // adaptador, y la migración 0015 lo revoca a todos los roles.
    const fuente = readFileSync(
      new URL('../src/padron/infraestructura/repositorio-pg.ts', import.meta.url),
      'utf8',
    );
    const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    expect(sinComentarios).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(sinComentarios).not.toMatch(/\bTRUNCATE\b/i);
  });
});

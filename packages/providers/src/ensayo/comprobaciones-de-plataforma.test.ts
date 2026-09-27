import { describe, expect, it } from 'vitest';
import {
  PROVEEDORES_REALES,
  juzgarConexionDePgBoss,
  juzgarProveedorDeEquipos,
  lineasDeComprobaciones,
} from './comprobaciones-de-plataforma';
import { recuentoDe } from './informe-de-ensayo';

/**
 * F3 y C1 (corrección de la 15-L) · lo que el `.env` de la API rompe sin que
 * ningún equipo lo note: el modo simulado con equipos reales dados de alta, y
 * pg-boss contra la conexión directa de Supabase (sólo IPv6).
 */
// Contraseña corta a propósito: es un ejemplo, no una credencial.
const DIRECTA = 'postgresql://postgres:p@db.abcdefghijkl.supabase.co:5432/postgres';
const SESION = 'postgresql://postgres.abc:p@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';
const TRANSACCION = 'postgresql://postgres.abc:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres';

describe('F3 · el proveedor de equipos frente a los equipos reales', () => {
  it('simulado con equipos reales registrados: FALLO, y nombra el valor real', () => {
    const r = juzgarProveedorDeEquipos({ PROVEEDOR_DE_EQUIPOS: 'simulado' }, 2);
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(/^Equipos simulados: las órdenes no llegan a ningún equipo real/);
    expect(r.accion).toBe(
      `En apps/api/.env ponga PROVEEDOR_DE_EQUIPOS=${PROVEEDORES_REALES.join(' o ')} y reinicie la API`,
    );
    expect(PROVEEDORES_REALES).not.toContain('simulado');
  });

  it('sin valor —o vacío— es simulado, como en el esquema de la API', () => {
    expect(juzgarProveedorDeEquipos({}, 1).estado).toBe('fallo');
    expect(juzgarProveedorDeEquipos({ PROVEEDOR_DE_EQUIPOS: '  ' }, 1).estado).toBe('fallo');
  });

  it('simulado sin equipos reales, o el proveedor real: OK; sin base: OMITIDO', () => {
    expect(juzgarProveedorDeEquipos({ PROVEEDOR_DE_EQUIPOS: 'simulado' }, 0).estado).toBe('ok');
    const real = juzgarProveedorDeEquipos({ PROVEEDOR_DE_EQUIPOS: PROVEEDORES_REALES[0] }, 3);
    expect(real.estado).toBe('ok');
    expect(real.detalle[0]).toMatch(/equipos reales registrados: 3/);
    expect(juzgarProveedorDeEquipos({}, null).estado).toBe('omitido');
  });
});

describe('C1 · pg-boss, con la MISMA regla que la API', () => {
  it('DATABASE_URL directa y sin PGBOSS_DATABASE_URL: FALLO, «Defina PGBOSS_DATABASE_URL»', () => {
    const r = juzgarConexionDePgBoss({ DATABASE_URL: DIRECTA });
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(
      /conexión DIRECTA de Supabase \(db\.abcdefghijkl\.supabase\.co:5432\).*IPv6/,
    );
    expect(r.accion).toMatch(/^Defina PGBOSS_DATABASE_URL.*pooler en modo sesión \(:5432\)/);
    expect(r.detalle).toEqual(['pg-boss usará DATABASE_URL → db.abcdefghijkl.supabase.co:5432']);
    expect(JSON.stringify(r)).not.toContain(':p@');
  });

  it('PGBOSS_DATABASE_URL manda sobre DATABASE_URL; vacía, no', () => {
    expect(
      juzgarConexionDePgBoss({ DATABASE_URL: DIRECTA, PGBOSS_DATABASE_URL: SESION }).estado,
    ).toBe('ok');
    const mala = juzgarConexionDePgBoss({ DATABASE_URL: SESION, PGBOSS_DATABASE_URL: DIRECTA });
    expect(mala.accion).toMatch(/^Cambie PGBOSS_DATABASE_URL/);
    expect(juzgarConexionDePgBoss({ DATABASE_URL: DIRECTA, PGBOSS_DATABASE_URL: ' ' }).estado).toBe(
      'fallo',
    );
  });

  it('el pooler de TRANSACCIÓN y una cadena ilegible también fallan; sin cadena, OMITIDO', () => {
    expect(juzgarConexionDePgBoss({ PGBOSS_DATABASE_URL: TRANSACCION }).causa).toMatch(
      /modo TRANSACCIÓN/,
    );
    expect(juzgarConexionDePgBoss({ DATABASE_URL: 'no es una url' }).causa).toMatch(
      /DATABASE_URL no es una URL/,
    );
    expect(juzgarConexionDePgBoss({}).estado).toBe('omitido');
    expect(juzgarConexionDePgBoss({ DATABASE_URL: 'postgresql://h.invalid/db' }).causa).toBe(
      'pg-boss conecta a h.invalid:5432',
    );
  });
});

describe('las líneas y el veredicto', () => {
  it('se imprimen con su acción, sin secretos, y un FALLO cuenta en el veredicto', () => {
    const comprobaciones = [
      juzgarProveedorDeEquipos({ PROVEEDOR_DE_EQUIPOS: 'simulado' }, 1),
      juzgarConexionDePgBoss({ DATABASE_URL: SESION }),
    ];
    const lineas = lineasDeComprobaciones(comprobaciones, ['sa-east-1']);
    expect(lineas[0]).toMatch(/^ {2}· Proveedor de equipos de la API\.+ FALLO — Equipos simulados/);
    expect(lineas[1]).toMatch(/^ {5}→ En apps\/api\/\.env ponga PROVEEDOR_DE_EQUIPOS=/);
    expect(lineas.join('\n')).not.toContain('sa-east-1');
    expect(lineas.some((l) => /OK — pg-boss conecta a/.test(l))).toBe(true);
    expect(recuentoDe([], comprobaciones)).toEqual({ ok: 1, fallo: 1, omitido: 0, no_aplica: 0 });
  });
});

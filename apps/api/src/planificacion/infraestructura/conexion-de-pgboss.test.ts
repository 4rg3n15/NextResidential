import { describe, expect, it } from 'vitest';
import { conexionDePgBoss } from './conexion-de-pgboss';

/**
 * H-SITIO-07 · en sitio pg-boss usó la conexión directa de Supabase, que sólo
 * resuelve por IPv6, y murió con `ENOTFOUND` en una red sólo IPv4. Las cadenas
 * de abajo son de forma, no reales: el `<ref>` es inventado.
 */
// Sin contraseña a propósito: el escaneo de secretos marca, con razón, toda
// cadena `usuario:clave@`. La clase se decide por host y puerto, no por ella.
const cadena = (usuario: string, host: string, puerto: number): string =>
  `postgresql://${usuario}@${host}:${String(puerto)}/postgres`;
const DIRECTA = cadena('app_api', 'db.abcdefghij.supabase.co', 5432);
const SESION = cadena('app_api.abcdefghij', 'aws-0-us-east-1.pooler.supabase.com', 5432);
const TRANSACCION = cadena('app_api.abcdefghij', 'aws-0-us-east-1.pooler.supabase.com', 6543);

describe('H-SITIO-07 · qué conexión usa pg-boss', () => {
  it('sin PGBOSS_DATABASE_URL usa DATABASE_URL, y si es la directa lo AVISA', () => {
    const c = conexionDePgBoss({ DATABASE_URL: DIRECTA });
    expect(c.variable).toBe('DATABASE_URL');
    expect(c.cadena).toBe(DIRECTA);
    expect(c.clase).toBe('directa_supabase');
    expect(c.aviso).toMatch(/IPv6/);
    expect(c.aviso).toMatch(/PGBOSS_DATABASE_URL/);
  });

  it('con PGBOSS_DATABASE_URL usa esa, y el pooler en modo sesión no avisa', () => {
    const c = conexionDePgBoss({ DATABASE_URL: DIRECTA, PGBOSS_DATABASE_URL: SESION });
    expect(c.variable).toBe('PGBOSS_DATABASE_URL');
    expect(c.cadena).toBe(SESION);
    expect(c.clase).toBe('pooler_sesion');
    expect(c.aviso).toBeNull();
  });

  it('una PGBOSS_DATABASE_URL vacía cuenta como ausente', () => {
    expect(conexionDePgBoss({ DATABASE_URL: SESION, PGBOSS_DATABASE_URL: '' }).variable).toBe(
      'DATABASE_URL',
    );
  });

  it('el pooler en modo transacción (6543) se avisa: pg-boss necesita sesión', () => {
    const c = conexionDePgBoss({ DATABASE_URL: TRANSACCION });
    expect(c.clase).toBe('pooler_transaccion');
    expect(c.aviso).toMatch(/5432/);
  });

  it('el destino que va a la bitácora NO lleva el usuario (ni, por tanto, su clave)', () => {
    const c = conexionDePgBoss({ DATABASE_URL: SESION });
    expect(c.destino).toBe('aws-0-us-east-1.pooler.supabase.com:5432');
    expect(c.destino).not.toMatch(/app_api/);
  });

  it('otra base (la de pruebas, un servidor propio) no avisa; una cadena ilegible sí', () => {
    expect(conexionDePgBoss({ DATABASE_URL: 'postgresql://u@127.0.0.1/ncr' })).toMatchObject({
      clase: 'otra',
      destino: '127.0.0.1:5432',
      aviso: null,
    });
    expect(conexionDePgBoss({ DATABASE_URL: 'marcador' }).clase).toBe('ilegible');
  });
});

import { describe, expect, it } from 'vitest';
// La regla del ensayo en sitio, desde su FUENTE (nunca `dist/`): la prueba de
// paridad de abajo existe para que las dos no se separen.
import { juzgarPresupuestoDeConexiones } from '../../../../packages/providers/src/ensayo/comprobaciones-de-plataforma';
import { ErrorDeConfiguracion, cargarConfiguracion } from './esquema';
import { presupuestoDeConexiones } from './presupuesto-de-conexiones';

const completo = {
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'valor-de-prueba',
  SUPABASE_SECRET_KEY: 'valor-de-prueba',
  SUPABASE_JWKS_URL: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json',
  DATABASE_URL: 'valor-de-prueba',
  DATABASE_POOLER_URL: 'valor-de-prueba',
  CORS_ALLOWED_ORIGINS: 'https://consola.ejemplo.co',
  INGESTA_FIRMA_SECRETO: 'secreto-de-prueba-de-treinta-y-dos-o-mas',
  BIOMETRIA_LLAVE: 'llave-de-prueba-de-treinta-y-dos-o-mas',
  EQUIPOS_LLAVE: 'llave-de-equipos-de-treinta-y-dos-o-mas',
};

const cargar = (extra: Record<string, string>) =>
  cargarConfiguracion({ ...completo, ...extra } as NodeJS.ProcessEnv);

describe('15-O · el presupuesto de conexiones contra el pooler de Supabase', () => {
  it('por omisión cabe en el plan gratuito: 10 de la API + 2 de pg-boss de 15', () => {
    const c = cargar({});
    expect([c.PG_POOL_MAX, c.PGBOSS_POOL_MAX, c.SUPABASE_POOLER_MAX_CLIENTES]).toEqual([10, 2, 15]);
    expect(presupuestoDeConexiones(c)).toEqual({
      api: 10,
      pgboss: 2,
      total: 12,
      limite: 15,
      excede: false,
    });
  });

  it('lo de sitio el 30/09 —20 + 2 contra 15— NO arranca, y dice los números y qué cambiar', () => {
    expect(() => cargar({ PG_POOL_MAX: '20' })).toThrow(ErrorDeConfiguracion);
    expect(() => cargar({ PG_POOL_MAX: '20' })).toThrow(
      /PG_POOL_MAX \(20\) \+ PGBOSS_POOL_MAX \(2\) = 22 > SUPABASE_POOLER_MAX_CLIENTES \(15\).*Pool Size/,
    );
  });

  it('justo en el límite arranca; con el planificador apagado, pg-boss no suma', () => {
    expect(cargar({ PG_POOL_MAX: '13' }).PG_POOL_MAX).toBe(13);
    expect(() => cargar({ PG_POOL_MAX: '14' })).toThrow(/= 16 > /);
    expect(cargar({ PG_POOL_MAX: '15', PLANIFICADOR_HABILITADO: 'false' }).PG_POOL_MAX).toBe(15);
  });

  it('un pooler más grande admite un pool más grande', () => {
    expect(cargar({ PG_POOL_MAX: '40', SUPABASE_POOLER_MAX_CLIENTES: '60' }).PG_POOL_MAX).toBe(40);
  });

  it('PARIDAD · el ensayo en sitio falla por la API exactamente cuando la API no arranca', () => {
    const casos: Record<string, string>[] = [
      {},
      { PG_POOL_MAX: '13' },
      { PG_POOL_MAX: '14' },
      { PG_POOL_MAX: '20' },
      { PG_POOL_MAX: '15', PLANIFICADOR_HABILITADO: 'false' },
      { PG_POOL_MAX: '16', PLANIFICADOR_HABILITADO: 'false' },
      { PG_POOL_MAX: '10', PGBOSS_POOL_MAX: '6' },
      { PG_POOL_MAX: '40', SUPABASE_POOLER_MAX_CLIENTES: '60' },
      { SUPABASE_POOLER_MAX_CLIENTES: '11' },
    ];
    for (const caso of casos) {
      let apiArranca = true;
      try {
        cargar(caso);
      } catch {
        apiArranca = false;
      }
      const ensayo = juzgarPresupuestoDeConexiones(caso);
      const ensayoDiceQueNoArranca = ensayo.estado === 'fallo' && /no arranca/.test(ensayo.causa);
      expect(ensayoDiceQueNoArranca, JSON.stringify(caso)).toBe(!apiArranca);
    }
  });
});

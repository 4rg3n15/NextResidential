import { describe, expect, it } from 'vitest';
import { ErrorDeConfiguracion, cargarConfiguracion } from './esquema';

const completo = {
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'valor-de-prueba',
  SUPABASE_SECRET_KEY: 'valor-de-prueba',
  SUPABASE_JWKS_URL: 'https://ref.supabase.co/auth/v1/.well-known/jwks.json',
  DATABASE_URL: 'valor-de-prueba',
  DATABASE_POOLER_URL: 'valor-de-prueba',
  CORS_ALLOWED_ORIGINS: 'https://consola.ejemplo.co, https://admin.ejemplo.co',
  // RNF-03.11: sin secreto de firma la ingesta aceptaría eventos de cualquiera,
  // así que es obligatoria como las demás y su ausencia impide el arranque.
  INGESTA_FIRMA_SECRETO: 'secreto-de-prueba-de-treinta-y-dos-o-mas',
  BIOMETRIA_LLAVE: 'llave-de-prueba-de-treinta-y-dos-o-mas',
};

describe('configuración (DoD ETAPA 02: sin .env completo no arranca)', () => {
  it('acepta un entorno completo y parte los orígenes', () => {
    const c = cargarConfiguracion(completo as NodeJS.ProcessEnv);
    expect(c.origenesPermitidos).toEqual([
      'https://consola.ejemplo.co',
      'https://admin.ejemplo.co',
    ]);
    expect(c.PORT).toBe(3000);
  });

  it('falla si falta CUALQUIER variable obligatoria', () => {
    for (const clave of Object.keys(completo)) {
      const parcial = { ...completo } as Record<string, string>;
      delete parcial[clave];
      expect(() => cargarConfiguracion(parcial as NodeJS.ProcessEnv), clave).toThrow(
        ErrorDeConfiguracion,
      );
    }
  });

  it('rechaza `*` en CORS y una lista vacía (§2.7.2)', () => {
    expect(() =>
      cargarConfiguracion({ ...completo, CORS_ALLOWED_ORIGINS: '*' } as NodeJS.ProcessEnv),
    ).toThrow(/no admite/);
    expect(() =>
      cargarConfiguracion({ ...completo, CORS_ALLOWED_ORIGINS: ' , ' } as NodeJS.ProcessEnv),
    ).toThrow(ErrorDeConfiguracion);
  });

  it('el mensaje de error NUNCA incluye el valor de la llave secreta', () => {
    try {
      cargarConfiguracion({ ...completo, SUPABASE_URL: 'no-es-url' } as NodeJS.ProcessEnv);
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message).not.toContain('valor-de-prueba');
    }
  });
});

describe('biometría · la llave de cifrado es requisito de arranque (ETAPA 08)', () => {
  it('sin BIOMETRIA_LLAVE la aplicación no arranca', () => {
    const sinLlave: Record<string, unknown> = { ...completo };
    delete sinLlave.BIOMETRIA_LLAVE;
    expect(() => cargarConfiguracion(sinLlave)).toThrow();
  });

  it('una llave corta se rechaza: 32 caracteres es el mínimo', () => {
    expect(() => cargarConfiguracion({ ...completo, BIOMETRIA_LLAVE: 'corta' })).toThrow();
  });

  it('BIOMETRIA_LLAVE_REF es una REFERENCIA, no la llave', () => {
    // Si admitiera texto libre, alguien acabaría poniendo ahí el valor y la
    // llave viajaría a la base en cada fila de plantilla (migración 0008).
    expect(() =>
      cargarConfiguracion({ ...completo, BIOMETRIA_LLAVE_REF: 'llave-secreta-en-claro' }),
    ).toThrow();
    expect(
      cargarConfiguracion({ ...completo, BIOMETRIA_LLAVE_REF: 'vault:ncr/plantillas/v1' })
        .BIOMETRIA_LLAVE_REF,
    ).toBe('vault:ncr/plantillas/v1');
  });

  it('por defecto apunta a la variable de entorno', () => {
    expect(cargarConfiguracion(completo).BIOMETRIA_LLAVE_REF).toBe('env:BIOMETRIA_LLAVE');
  });
});

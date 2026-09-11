import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * §2.7.1 · **la aplicación no arranca con la configuración incompleta.**
 *
 * La consola no lo cumplía y el precio se pagó en el camino de acceso: con el
 * entorno a medias, el primer síntoma era un `503` en mitad del inicio de
 * sesión. Aquí se comprueba lo único que lo impide de verdad — que el proceso
 * **se detiene al arrancar**, con el código que distingue «mal configurado» de
 * «se ha caído».
 */
const COMPLETO = {
  NEXT_RUNTIME: 'nodejs',
  NODE_ENV: 'test',
  API_URL: 'http://api.interno:3000',
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'llave-publicable-de-prueba',
};

let salidas: number[];
let registros: string[];

const arrancar = async (entorno: Record<string, string | undefined>): Promise<void> => {
  vi.resetModules();
  for (const [k, v] of Object.entries(entorno)) {
    if (v === undefined) vi.stubEnv(k, '');
    else vi.stubEnv(k, v);
  }
  const { register } = await import('./instrumentation');
  await register();
};

beforeEach(() => {
  salidas = [];
  registros = [];
  // Se intercepta `process.exit` sobre el objeto real: el módulo lo resuelve
  // en el momento de llamarlo, así que sustituir el `process` global entero no
  // servía — el proceso de prueba se moría de verdad, que es una forma
  // llamativa de comprobar que el código 78 funciona pero no de afirmarlo.
  vi.spyOn(process, 'exit').mockImplementation(((codigo?: number) => {
    salidas.push(codigo ?? 0);
  }) as never);
  vi.spyOn(console, 'error').mockImplementation((linea: unknown) => {
    registros.push(String(linea));
  });
  // El mensaje legible del fallo va a `stderr` sin envolver, así que también
  // se recoge: si no, esta suite estaría comprobando solo la mitad.
  vi.spyOn(process.stderr, 'write').mockImplementation(((linea: string) => {
    registros.push(linea);
    return true;
  }) as never);
  vi.spyOn(console, 'warn').mockImplementation((linea: unknown) => {
    registros.push(String(linea));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('el arranque de la consola valida su entorno', () => {
  it('con el entorno completo NO se detiene, y lo deja escrito', async () => {
    await arrancar(COMPLETO);
    expect(salidas).toEqual([]);
    expect(registros.join(' ')).toContain('configuracion validada');
  });

  it('sin SUPABASE_URL se detiene con código 78 (EX_CONFIG)', async () => {
    await arrancar({ ...COMPLETO, SUPABASE_URL: undefined });
    expect(salidas).toEqual([78]);
  });

  it('el mensaje dice qué falta y dónde ponerlo', async () => {
    await arrancar({ ...COMPLETO, SUPABASE_PUBLISHABLE_KEY: undefined });
    const dicho = registros.join(' ');
    expect(dicho).toContain('SUPABASE_PUBLISHABLE_KEY');
    expect(dicho).toContain('.env.local');
  });

  it('el mensaje NO vuelca el entorno', async () => {
    // Un fallo de arranque que imprime variables es un fallo de arranque que
    // publica una llave en los registros (§2.7.8).
    await arrancar({ ...COMPLETO, SUPABASE_URL: 'no-es-una-url' });
    const dicho = registros.join(' ');
    expect(salidas).toEqual([78]);
    expect(dicho).not.toContain('llave-publicable-de-prueba');
    expect(dicho).not.toContain('no-es-una-url');
  });

  it('en el runtime `edge` no hace nada: allí no hay proceso que detener', async () => {
    await arrancar({ ...COMPLETO, NEXT_RUNTIME: 'edge', SUPABASE_URL: undefined });
    expect(salidas).toEqual([]);
  });

  it('durante `next build` no se detiene: el CI compila sin entorno de producción', async () => {
    await arrancar({ ...COMPLETO, NEXT_PHASE: 'phase-production-build', API_URL: undefined });
    expect(salidas).toEqual([]);
  });
});

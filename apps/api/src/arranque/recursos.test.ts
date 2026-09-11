import { describe, expect, it, vi } from 'vitest';
import { comprobarRecursosExternos } from './recursos-externos';
import type { RecursoExterno } from './recursos-externos';
import { recursoBucketDeEvidencia, recursoJwks, recursoRecuperacionDeContrasena } from './recursos';
import type { ProveedorDeJwks } from '../autenticacion';

const bitacoraDePrueba = () => {
  const lineas: { nivel: string; mensaje: string; contexto?: unknown }[] = [];
  return {
    lineas,
    registrar: (nivel: string, mensaje: string, contexto?: unknown) =>
      lineas.push({ nivel, mensaje, contexto }),
  };
};

const jwksQueResponde = (estado: unknown) => ({ sondear: async () => estado }) as ProveedorDeJwks;

describe('comprobación de recursos externos al arrancar', () => {
  it('un JWKS sin claves es un recurso ROTO, y el remedio apunta al panel', async () => {
    const bitacora = bitacoraDePrueba();
    const informe = await comprobarRecursosExternos(
      [recursoJwks(jwksQueResponde({ estado: 'sin-claves' }))],
      bitacora,
    );
    expect(informe.hayCriticoRoto).toBe(true);
    expect(informe.recursos[0]?.remedio).toMatch(/JWT Keys/);
  });

  it('un JWKS inalcanzable nombra la variable y la ruta correcta', async () => {
    const informe = await comprobarRecursosExternos(
      [recursoJwks(jwksQueResponde({ estado: 'inalcanzable', detalle: 'JOSEError: 404' }))],
      bitacoraDePrueba(),
    );
    expect(informe.recursos[0]?.remedio).toMatch(/SUPABASE_JWKS_URL/);
    expect(informe.recursos[0]?.remedio).toMatch(/\.well-known\/jwks\.json/);
  });

  it('un recurso crítico roto se registra como ERROR, no como aviso', async () => {
    const bitacora = bitacoraDePrueba();
    await comprobarRecursosExternos(
      [recursoJwks(jwksQueResponde({ estado: 'sin-claves' }))],
      bitacora,
    );
    expect(bitacora.lineas[0]?.nivel).toBe('error');
  });

  it('el bucket público es un hallazgo, aunque exista y responda', async () => {
    // `public: true` es lo que hace que la evidencia de un acceso —que es
    // prueba— quede a la vista de cualquiera con la ruta (RN-21).
    const pedir = vi.fn(
      async () =>
        new Response(JSON.stringify({ name: 'evidencia', public: true }), { status: 200 }),
    ) as unknown as typeof fetch;
    const informe = await comprobarRecursosExternos(
      [
        recursoBucketDeEvidencia({
          supabaseUrl: 'https://ref.supabase.co',
          llaveSecreta: 'secreta',
          bucket: 'evidencia',
          pedir,
        }),
      ],
      bitacoraDePrueba(),
    );
    expect(informe.recursos[0]).toMatchObject({ estado: 'roto' });
    expect(informe.recursos[0]?.detalle).toMatch(/PÚBLICO/);
  });

  it('un bucket privado se comprueba TAMBIÉN con una petición sin firmar', async () => {
    /**
     * `public: false` es una propiedad declarada. Que se cumpla es otra cosa, y
     * solo lo demuestra una petición anónima que falle: la suite anterior
     * comprobaba la fila `evidencias`, nunca el bucket (DT-12).
     */
    const llamadas: string[] = [];
    const pedir = vi.fn(async (url: string) => {
      llamadas.push(String(url));
      if (String(url).includes('/bucket/')) {
        return new Response(JSON.stringify({ name: 'evidencia', public: false }), { status: 200 });
      }
      return new Response('no autorizado', { status: 400 });
    }) as unknown as typeof fetch;

    const informe = await comprobarRecursosExternos(
      [
        recursoBucketDeEvidencia({
          supabaseUrl: 'https://ref.supabase.co',
          llaveSecreta: 'secreta',
          bucket: 'evidencia',
          pedir,
        }),
      ],
      bitacoraDePrueba(),
    );
    expect(informe.recursos[0]?.estado).toBe('ok');
    expect(llamadas.some((u) => u.includes('/object/'))).toBe(true);
  });

  it('un GET sin firmar que devuelve 200 delata el bucket, diga lo que diga la propiedad', async () => {
    const pedir = vi.fn(async (url: string) =>
      String(url).includes('/bucket/')
        ? new Response(JSON.stringify({ name: 'evidencia', public: false }), { status: 200 })
        : new Response('contenido', { status: 200 }),
    ) as unknown as typeof fetch;
    const informe = await comprobarRecursosExternos(
      [
        recursoBucketDeEvidencia({
          supabaseUrl: 'https://ref.supabase.co',
          llaveSecreta: 'secreta',
          bucket: 'evidencia',
          pedir,
        }),
      ],
      bitacoraDePrueba(),
    );
    expect(informe.recursos[0]?.estado).toBe('roto');
  });

  it('sin bucket declarado se dice que la evidencia vive en memoria, y no es crítico', async () => {
    const informe = await comprobarRecursosExternos(
      [
        recursoBucketDeEvidencia({
          supabaseUrl: 'https://ref.supabase.co',
          llaveSecreta: 'secreta',
          bucket: undefined,
        }),
      ],
      bitacoraDePrueba(),
    );
    expect(informe.recursos[0]?.estado).toBe('sin-configurar');
    expect(informe.hayCriticoRoto).toBe(false);
  });

  it('la recuperación NUNCA se declara verificada: el SMTP no es observable desde la API', async () => {
    /**
     * Bloqueo de entorno declarado (2026-09-10): el cliente no tiene permisos
     * para configurar SMTP ni URLs de redirección en su panel. La comprobación
     * dice qué falta, y sobre todo **no da por bueno** lo que no puede ver.
     */
    const informe = await comprobarRecursosExternos(
      [
        recursoRecuperacionDeContrasena({
          urlDeRedireccion: 'https://consola.ejemplo.co/acceso/nueva-contrasena',
          origenesPermitidos: ['https://consola.ejemplo.co'],
        }),
      ],
      bitacoraDePrueba(),
    );
    expect(informe.recursos[0]?.estado).toBe('sin-configurar');
    expect(informe.recursos[0]?.detalle).toMatch(/SIN VERIFICAR/);
  });

  it('una redirección a un origen no admitido por CORS está rota', async () => {
    const informe = await comprobarRecursosExternos(
      [
        recursoRecuperacionDeContrasena({
          urlDeRedireccion: 'https://otro-sitio.example/acceso',
          origenesPermitidos: ['https://consola.ejemplo.co'],
        }),
      ],
      bitacoraDePrueba(),
    );
    expect(informe.recursos[0]?.estado).toBe('roto');
  });

  it('una comprobación que se cuelga no cuelga el arranque', async () => {
    const colgado: RecursoExterno = {
      nombre: 'el que no contesta',
      critico: true,
      comprobar: () => new Promise(() => undefined),
    };
    const informe = await comprobarRecursosExternos([colgado], bitacoraDePrueba(), 20);
    expect(informe.recursos[0]?.estado).toBe('roto');
  });
});

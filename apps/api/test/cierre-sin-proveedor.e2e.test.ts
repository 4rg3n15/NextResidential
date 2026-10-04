import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
// `utilidades` PRIMERO: carga `AppModule` en su orden (ciclo eventos ↔ autorizaciones).
import { COP_A, crearApp, crearFirmante, tokenDe } from './utilidades';
import type { Firmante } from './utilidades';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { PROVEEDOR_DE_IDENTIDAD } from '../src/cuentas/aplicacion/puertos';
import {
  ESPERAS_DE_LA_REVOCACION_MS,
  RevocacionConReintento,
} from '../src/cuentas/aplicacion/revocacion-con-reintento';
import { CuentasSupabase } from '../src/cuentas/infraestructura/cuentas-supabase';
import type { Configuracion } from '../src/configuracion/esquema';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E4 · CERRAR SESIÓN CON SUPABASE CAÍDO
 *
 * `POST /auth/cierre` devolvía 500 si el proveedor no contestaba. Ahora la
 * sesión local se cierra, la respuesta es 200, y la revocación remota se
 * reintenta (5 s, 30 s, 2 min) sin escribir el token en ninguna parte.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const TOKEN = 'eyJ.token-que-no-debe-aparecer-en-la-bitacora.firma';

const bitacoraEspia = () => {
  const lineas: { nivel: string; mensaje: string; datos: unknown }[] = [];
  const b: Bitacora = {
    registrar: (nivel, mensaje, datos) => {
      lineas.push({ nivel, mensaje, datos });
    },
  } as Bitacora;
  return { b, lineas };
};

describe('E4 · la revocación remota se reintenta y nunca escribe el token', () => {
  it('falla dos veces, acierta a la tercera: info final, y el token no aparece', async () => {
    let intentos = 0;
    const tareas: (() => void)[] = [];
    const { b, lineas } = bitacoraEspia();
    const r = new RevocacionConReintento(
      {
        cerrarSesion: async () => {
          intentos += 1;
          if (intentos < 3) throw new TypeError('fetch failed');
        },
      },
      b,
      (_ms, tarea) => tareas.push(tarea),
    );
    await r.cerrarSesion(TOKEN); // no lanza
    for (let i = 0; i < 5 && tareas.length > 0; i += 1) {
      tareas.shift()?.();
      await new Promise((listo) => setImmediate(listo));
    }
    expect(intentos).toBe(3);
    expect(lineas.at(-1)?.mensaje).toMatch(/confirmada tras reintento/);
    expect(JSON.stringify(lineas)).not.toContain(TOKEN);
  });

  it('nunca contesta: tras los reintentos, error en la bitácora (y el token, fuera)', async () => {
    const tareas: { ms: number; tarea: () => void }[] = [];
    const { b, lineas } = bitacoraEspia();
    const r = new RevocacionConReintento(
      { cerrarSesion: async () => Promise.reject(new Error('timeout')) },
      b,
      (ms, tarea) => tareas.push({ ms, tarea }),
    );
    await r.cerrarSesion(TOKEN);
    const esperas: number[] = [];
    while (tareas.length > 0) {
      const t = tareas.shift();
      if (t === undefined) break;
      esperas.push(t.ms);
      t.tarea();
      await new Promise((listo) => setImmediate(listo));
    }
    expect(esperas).toEqual([...ESPERAS_DE_LA_REVOCACION_MS]);
    expect(lineas.at(-1)).toMatchObject({ nivel: 'error' });
    expect(JSON.stringify(lineas)).not.toContain(TOKEN);
  });
});

describe('E4 · el adaptador de Supabase: mudo o 5xx lanza; 401/404 es «ya cerrada»', () => {
  const supabase = () =>
    new CuentasSupabase(
      { SUPABASE_URL: 'https://proyecto.invalid' } as Configuracion,
      bitacoraEspia().b,
    );
  afterEach(() => vi.unstubAllGlobals());

  it.each([503, 500])('HTTP %i: lanza, para que el cierre reintente', async (estado) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: estado })),
    );
    await expect(supabase().cerrarSesion(TOKEN)).rejects.toThrow(String(estado));
  });

  it.each([401, 404, 204])('HTTP %i: no lanza', async (estado) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: estado })),
    );
    await expect(supabase().cerrarSesion(TOKEN)).resolves.toBeUndefined();
  });

  it('la petición lleva un tiempo máximo (un proveedor mudo no cuelga el cierre)', async () => {
    const espia = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(null, { status: 204 });
    });
    vi.stubGlobal('fetch', espia);
    await supabase().cerrarSesion(TOKEN);
    expect(espia).toHaveBeenCalledOnce();
  });
});

describe('E4 · POST /auth/cierre con el proveedor caído', () => {
  let app: INestApplication;
  let firmante: Firmante;
  const lineas: string[] = [];

  beforeAll(async () => {
    firmante = await crearFirmante();
    app = await crearApp(firmante, (b) =>
      b.overrideProvider(PROVEEDOR_DE_IDENTIDAD).useValue({
        cerrarSesion: async () => Promise.reject(new TypeError('fetch failed')),
      }),
    );
    const bitacora = app.get<Bitacora>(BITACORA);
    const original = bitacora.registrar.bind(bitacora);
    vi.spyOn(bitacora, 'registrar').mockImplementation((n, m, d) => {
      lineas.push(JSON.stringify({ n, m, d }));
      original(n, m, d);
    });
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await app?.close();
  });

  it('responde 200 «sesion_cerrada» y deja la revocación pendiente anotada', async () => {
    const token = await tokenDe(firmante, { rol: 'administrador', copropiedadId: COP_A });
    const r = await request(app.getHttpServer())
      .post('/auth/cierre')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toEqual({ hecho: 'sesion_cerrada' });
    expect(lineas.some((l) => l.includes('revocación remota pendiente'))).toBe(true);
    expect(lineas.join('\n')).not.toContain(token);
  });
});

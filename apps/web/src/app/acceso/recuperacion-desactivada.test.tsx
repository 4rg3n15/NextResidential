import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { NextRequest } from 'next/server';
import { EnlaceDeRecuperacion } from './enlace-de-recuperacion';
import { despliegue } from '@/lib/configuracion-de-despliegue';
import { MENSAJE_RECUPERACION_DESACTIVADA } from '@/lib/recuperacion';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E8 · AR-04 · LA RECUPERACIÓN POR CORREO, DESACTIVADA EN PRODUCCIÓN
 *
 * Sin declarar `RECUPERACION_POR_CORREO`, en producción está desactivada; la
 * ruta contesta SIEMPRE lo mismo (exista o no la cuenta, tenga o no forma de
 * correo) sin llamar a Supabase, y la consola dice a quién acudir.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const solicitar = vi.fn(async () => undefined);
vi.mock('@/lib/sesion/supabase-auth', () => ({
  FalloDeAcceso: class extends Error {},
  solicitarRecuperacion: solicitar,
}));

beforeEach(() => {
  vi.resetModules();
  solicitar.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

const pedir = async (cuerpo: unknown) => {
  const { POST } = await import('@/app/api/sesion/recuperacion/route');
  const url = 'http://consola/api/sesion/recuperacion';
  const r = new Request(url, { method: 'POST', body: JSON.stringify(cuerpo) }) as NextRequest;
  Object.defineProperty(r, 'nextUrl', { value: new URL(url) });
  const respuesta = await POST(r);
  return { estado: respuesta.status, cuerpo: (await respuesta.json()) as unknown };
};

describe('E8 · la decisión por despliegue', () => {
  it('producción sin declarar: desactivada; fuera de producción: activa; declarada: manda', () => {
    expect(despliegue({ NODE_ENV: 'production' }).recuperacionPorCorreo).toBe(false);
    expect(despliegue({ NODE_ENV: 'development' }).recuperacionPorCorreo).toBe(true);
    expect(
      despliegue({ NODE_ENV: 'production', RECUPERACION_POR_CORREO: 'activa' })
        .recuperacionPorCorreo,
    ).toBe(true);
    expect(despliegue({ RECUPERACION_POR_CORREO: 'desactivada' }).recuperacionPorCorreo).toBe(
      false,
    );
  });

  it('VACÍA es como sin declarar (DT-15S1-02); cualquier otro valor sigue sin arrancar', () => {
    const vacia = (NODE_ENV: string) =>
      despliegue({ NODE_ENV, RECUPERACION_POR_CORREO: '' }).recuperacionPorCorreo;
    expect(vacia('production')).toBe(false);
    expect(vacia('development')).toBe(true);
    expect(() => despliegue({ RECUPERACION_POR_CORREO: 'desactivado' })).toThrow(
      /RECUPERACION_POR_CORREO: .*'activa' \| 'desactivada'/,
    );
  });
});

describe('E8 · la ruta, desactivada', () => {
  it('cualquier correo —exista o no, bien o mal formado—: el MISMO 403, sin llamar a Supabase', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const respuestas = await Promise.all([
      pedir({ correo: 'admin@mira.example' }),
      pedir({ correo: 'nadie@nunca.example' }),
      pedir({ correo: 'no-es-correo' }),
      pedir(null),
    ]);
    for (const r of respuestas) {
      expect(r).toEqual({
        estado: 403,
        cuerpo: { mensaje: MENSAJE_RECUPERACION_DESACTIVADA, desactivada: true },
      });
    }
    expect(solicitar).not.toHaveBeenCalled();
  });

  it('activa (fuera de producción): sigue como siempre, respuesta uniforme', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const r = await pedir({ correo: 'admin@mira.example' });
    expect(r.estado).toBe(200);
    expect(solicitar).toHaveBeenCalledOnce();
  });
});

describe('E8 · la pantalla de acceso', () => {
  it('desactivada: «Contacta al administrador» y ningún enlace', () => {
    render(<EnlaceDeRecuperacion activa={false} />);
    expect(screen.getByText('Contacta al administrador')).toBeDefined();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('activa: el enlace de siempre', () => {
    render(<EnlaceDeRecuperacion activa />);
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toBeDefined();
  });
});

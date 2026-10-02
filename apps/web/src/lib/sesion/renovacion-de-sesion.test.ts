/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * 15-P · 0.3 · RENOVAR SÓLO DONDE SE PUEDEN ESCRIBIR COOKIES.
 *
 * Antes, un componente de servidor que encontraba el token por vencer lo
 * renovaba y escribía las cookies: Next lanza ahí, el refresco rotado se perdía
 * y la sesión quedaba destruida. Aquí: el middleware renueva y escribe; el
 * componente sólo lee, y con un token vencido devuelve null sin lanzar.
 */
const refrescar = vi.fn();
vi.mock('./supabase-auth', async () => {
  class FalloDeAcceso extends Error {}
  return { FalloDeAcceso, refrescarSesion: (r: string) => refrescar(r) };
});
const { FalloDeAcceso } = (await import('./supabase-auth')) as unknown as {
  FalloDeAcceso: new (m: string) => Error;
};
const { renovarSiHaceFalta } = await import('./renovar-en-middleware');

const AHORA = 1_800_000_000_000;
const segundos = Math.floor(AHORA / 1000);

const peticion = (cookies: Record<string, string>, ruta = '/tablero'): NextRequest => {
  const r = new NextRequest(`http://consola.invalid${ruta}`);
  for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
  return r;
};

beforeEach(() => {
  refrescar.mockReset();
});

describe('15-P · 0.3 · renovar en el middleware', () => {
  it('con margen de sobra no toca nada', async () => {
    const r = await renovarSiHaceFalta(
      peticion({ ncr_acceso: 'a', ncr_refresco: 'r', ncr_expira: String(segundos + 600) }),
      false,
      AHORA,
    );
    expect(r).toEqual({ tipo: 'nada' });
    expect(refrescar).not.toHaveBeenCalled();
  });

  it('token por vencer: renueva con el refresco y devuelve las tres cookies, httpOnly y Lax', async () => {
    refrescar.mockResolvedValue({
      accessToken: 'nuevo',
      refreshToken: 'r2',
      expiraEn: segundos + 300,
    });
    const r = await renovarSiHaceFalta(
      peticion({ ncr_acceso: 'a', ncr_refresco: 'r', ncr_expira: String(segundos + 30) }),
      true,
      AHORA,
    );
    expect(refrescar).toHaveBeenCalledWith('r');
    expect(r.tipo).toBe('renovada');
    if (r.tipo !== 'renovada') return;
    expect(r.cookies.map((c) => [c.nombre, c.valor])).toEqual([
      ['ncr_acceso', 'nuevo'],
      ['ncr_refresco', 'r2'],
      ['ncr_expira', String(segundos + 300)],
    ]);
    expect(r.cookies.every((c) => c.opciones.httpOnly && c.opciones.sameSite === 'lax')).toBe(true);
    expect(r.cookies.every((c) => c.opciones.secure)).toBe(true);
  });

  it('un token VENCIDO al renderizar también se renueva aquí, antes de pintar', async () => {
    refrescar.mockResolvedValue({
      accessToken: 'nuevo',
      refreshToken: 'r2',
      expiraEn: segundos + 300,
    });
    const r = await renovarSiHaceFalta(
      peticion({ ncr_acceso: 'viejo', ncr_refresco: 'r', ncr_expira: String(segundos - 120) }),
      false,
      AHORA,
    );
    expect(r.tipo).toBe('renovada');
  });

  it('refresco rechazado: «revocada», se borran las tres; nada lanza', async () => {
    refrescar.mockRejectedValue(new FalloDeAcceso('SESION_EXPIRADA'));
    const r = await renovarSiHaceFalta(
      peticion({ ncr_acceso: 'a', ncr_refresco: 'r', ncr_expira: String(segundos - 1) }),
      false,
      AHORA,
    );
    expect(r).toEqual({ tipo: 'revocada', borrar: ['ncr_acceso', 'ncr_refresco', 'ncr_expira'] });
  });

  it('la red falló: no borra nada (el token puede seguir valiendo)', async () => {
    refrescar.mockRejectedValue(new TypeError('fetch failed'));
    const r = await renovarSiHaceFalta(
      peticion({ ncr_acceso: 'a', ncr_refresco: 'r', ncr_expira: String(segundos + 30) }),
      false,
      AHORA,
    );
    expect(r).toEqual({ tipo: 'nada' });
  });

  it('sin cookie de refresco no hay sesión que renovar', async () => {
    expect(await renovarSiHaceFalta(peticion({}), false, AHORA)).toEqual({ tipo: 'nada' });
  });
});

describe('15-P · 0.3 · el middleware escribe en la respuesta y en la petición', () => {
  it('la página recibe el token nuevo y el navegador las cookies; /api no renueva aquí', async () => {
    refrescar.mockResolvedValue({
      accessToken: 'nuevo',
      refreshToken: 'r2',
      expiraEn: segundos + 9_999_999,
    });
    const { middleware } = await import('../../middleware');
    const vencida = { ncr_acceso: 'a', ncr_refresco: 'r', ncr_expira: '1' };
    const respuesta = await middleware(peticion(vencida, '/tablero'));
    const escritas = respuesta.cookies
      .getAll()
      .map((c) => c.name)
      .sort();
    expect(escritas).toEqual(['ncr_acceso', 'ncr_expira', 'ncr_refresco']);
    expect(respuesta.headers.get('x-middleware-request-cookie') ?? '').toContain(
      'ncr_acceso=nuevo',
    );

    refrescar.mockClear();
    await middleware(peticion(vencida, '/api/ncr/copropiedades'));
    expect(refrescar).not.toHaveBeenCalled();
  });
});

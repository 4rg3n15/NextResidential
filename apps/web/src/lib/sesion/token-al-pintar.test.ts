/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 15-P · 0.3 · UN TOKEN VENCIDO AL PINTAR NO HACE LANZAR A NEXT.
 *
 * Las cookies de este doble se comportan como en un componente de servidor:
 * leer se puede; escribir o borrar LANZA, como en Next.
 */
const galleta = new Map<string, string>();
const escrituras = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (n: string) => (galleta.has(n) ? { name: n, value: galleta.get(n) } : undefined),
    set: (...args: unknown[]) => {
      escrituras(...args);
      throw new Error('Cookies can only be modified in a Server Action or Route Handler');
    },
    delete: (...args: unknown[]) => {
      escrituras(...args);
      throw new Error('Cookies can only be modified in a Server Action or Route Handler');
    },
  }),
  headers: async () => new Headers(),
}));
const refrescar = vi.fn();
vi.mock('./supabase-auth', () => {
  class FalloDeAcceso extends Error {}
  return { FalloDeAcceso, refrescarSesion: (r: string) => refrescar(r) };
});
const { FalloDeAcceso } = (await import('./supabase-auth')) as unknown as {
  FalloDeAcceso: new (m: string) => Error;
};
const { tokenDeLectura, tokenVigente } = await import('./token');

const AHORA = 1_800_000_000_000;
const s = Math.floor(AHORA / 1000);

beforeEach(() => {
  galleta.clear();
  escrituras.mockClear();
  refrescar.mockReset();
});

describe('15-P · 0.3 · tokenDeLectura (componentes de servidor)', () => {
  it('token vencido al pintar: null, sin intentar escribir ni renovar', async () => {
    galleta
      .set('ncr_acceso', 'viejo')
      .set('ncr_refresco', 'r')
      .set('ncr_expira', String(s - 10));
    expect(await tokenDeLectura(AHORA)).toBeNull();
    expect(escrituras).not.toHaveBeenCalled();
    expect(refrescar).not.toHaveBeenCalled();
  });

  it('token válido (aunque esté dentro del margen): se usa tal cual', async () => {
    galleta
      .set('ncr_acceso', 'a')
      .set('ncr_refresco', 'r')
      .set('ncr_expira', String(s + 30));
    expect(await tokenDeLectura(AHORA)).toEqual({ accessToken: 'a', expiraEn: s + 30 });
  });

  it('sin sesión: null', async () => {
    expect(await tokenDeLectura(AHORA)).toBeNull();
  });
});

describe('15-P · 0.3 · tokenVigente (manejadores de ruta) no lanza al borrar', () => {
  it('refresco rechazado y borrado imposible: null, sin excepción', async () => {
    galleta
      .set('ncr_acceso', 'viejo')
      .set('ncr_refresco', 'r')
      .set('ncr_expira', String(s - 10));
    refrescar.mockRejectedValue(new FalloDeAcceso('SESION_EXPIRADA'));
    await expect(tokenVigente(AHORA)).resolves.toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { configuracionDePrueba } from '../../../test/utilidades';
import { CuentasSupabase } from './cuentas-supabase';
import type { CorreoSintetico } from '../dominio/correo-sintetico';

const SINTETICO =
  'porteria1@10000000-0000-4000-8000-000000000001.usuarios.ncr.invalid' as CorreoSintetico;
const registros: { mensaje: string; contexto: unknown }[] = [];
const bitacora: Bitacora = {
  registrar: (_nivel, mensaje, contexto) => void registros.push({ mensaje, contexto }),
} as Bitacora;
const adaptador = (): CuentasSupabase => new CuentasSupabase(configuracionDePrueba, bitacora);
const responder = (estado: number, cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  registros.length = 0;
});

describe('Supabase Auth detrás de los puertos de cuentas (ADR-023)', () => {
  it('copia TRES campos del token y ninguno del usuario; calcula la caducidad desde expires_in', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responder(200, {
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 600,
          user: { email: SINTETICO },
        }),
      ),
    );
    const antes = Math.floor(Date.now() / 1000);
    const s = await adaptador().iniciarSesion(SINTETICO, 'x');
    expect(s).toMatchObject({ accessToken: 'a', refreshToken: 'r' });
    expect(Object.keys(s ?? {})).toEqual(['accessToken', 'refreshToken', 'expiraEn']);
    expect((s?.expiraEn ?? 0) - antes).toBeGreaterThanOrEqual(599);
  });

  it('credenciales malas son `null`, no una excepción', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responder(400, { error_code: 'invalid_credentials' })),
    );
    expect(await adaptador().iniciarSesion(SINTETICO, 'mala')).toBeNull();
  });

  it('un alta repetida es DUPLICADO, y ningún registro lleva el correo sintético', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        responder(422, { error_code: 'email_exists', msg: `ya existe ${SINTETICO}` }),
      ),
    );
    expect(await adaptador().crear(SINTETICO, 'Clave#1234')).toEqual({
      ok: false,
      motivo: 'DUPLICADO',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responder(500, { msg: SINTETICO })),
    );
    await expect(adaptador().fijarContrasena('id', 'Clave#1234')).rejects.toThrow(
      'No se pudo contactar',
    );
    expect(JSON.stringify(registros)).not.toContain('.invalid');
  });

  it('la baja de compensación no relanza: el error original es el que importa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responder(500, {})),
    );
    await expect(adaptador().eliminar('id')).resolves.toBeUndefined();
    expect(registros.map((r) => r.mensaje)).toContain('no se pudo compensar un alta de cuenta');
  });
});

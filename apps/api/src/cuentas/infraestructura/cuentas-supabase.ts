import type { Bitacora } from '@ncr/domain-core';
import type { Configuracion } from '../../configuracion/esquema';
import type { CorreoSintetico } from '../dominio/correo-sintetico';
import type {
  AdministradorDeCuentas,
  CuentaCreada,
  ProveedorDeIdentidad,
  SesionEmitida,
} from '../aplicacion/puertos';

interface RespuestaDeToken {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  expires_in?: unknown;
}

/**
 * Instante de caducidad en segundos Unix. GoTrue manda `expires_at` y
 * `expires_in`; si sólo llega el segundo —versiones y dobles que lo omiten—, se
 * calcula. Sin ninguno de los dos, la respuesta no tiene forma.
 */
const caducidadDe = (cuerpo: RespuestaDeToken, ahoraMs: number): number | null => {
  if (typeof cuerpo.expires_at === 'number') return cuerpo.expires_at;
  if (typeof cuerpo.expires_in === 'number') return Math.floor(ahoraMs / 1000) + cuerpo.expires_in;
  return null;
};

/**
 * Supabase Auth detrás de los dos puertos de cuentas (ADR-023).
 *
 * **Lo que nunca sale de aquí:** el correo —sintético o real— que viaja al
 * proveedor, el cuerpo de sus respuestas (trae el objeto `user` con el correo)
 * y cualquier llave. De la respuesta del proveedor se copian TRES campos y el
 * resto se descarta; de un error, sólo el estado HTTP va a la bitácora.
 *
 * Inicio y cierre de sesión usan la llave PUBLICABLE, como lo haría el
 * navegador: son operaciones del propio usuario. Alta, contraseña y baja usan
 * la SECRETA, y son las únicas de este fichero que la tocan.
 */
export class CuentasSupabase implements ProveedorDeIdentidad, AdministradorDeCuentas {
  private readonly base: string;

  constructor(
    private readonly config: Configuracion,
    private readonly bitacora: Bitacora,
  ) {
    this.base = `${config.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1`;
  }

  async iniciarSesion(correo: string, contrasena: string): Promise<SesionEmitida | null> {
    const r = await fetch(`${this.base}/token?grant_type=password`, {
      method: 'POST',
      headers: this.publicas(),
      body: JSON.stringify({ email: correo, password: contrasena }),
    });
    if (r.status === 400 || r.status === 401 || r.status === 422) return null;
    if (!r.ok) throw this.fallo('inicio de sesión', r.status);
    const cuerpo = (await r.json()) as RespuestaDeToken;
    const { access_token, refresh_token } = cuerpo;
    const expiraEn = caducidadDe(cuerpo, Date.now());
    if (
      typeof access_token !== 'string' ||
      typeof refresh_token !== 'string' ||
      expiraEn === null
    ) {
      throw this.fallo('inicio de sesión: respuesta sin forma', r.status);
    }
    return { accessToken: access_token, refreshToken: refresh_token, expiraEn };
  }

  async cerrarSesion(accessToken: string): Promise<void> {
    const r = await fetch(`${this.base}/logout?scope=local`, {
      method: 'POST',
      headers: { ...this.publicas(), Authorization: `Bearer ${accessToken}` },
    });
    // 401/404: la sesión ya no existe, que es lo que se pedía.
    if (!r.ok && r.status !== 401 && r.status !== 404) {
      this.bitacora.registrar('aviso', 'no se pudo revocar una sesión en el proveedor', {
        estado: r.status,
      });
    }
  }

  async crear(correo: CorreoSintetico, contrasena: string): Promise<CuentaCreada> {
    const r = await fetch(`${this.base}/admin/users`, {
      method: 'POST',
      headers: this.secretas(),
      body: JSON.stringify({ email: correo, password: contrasena, email_confirm: true }),
    });
    if (r.status === 422 || r.status === 409) {
      const cuerpo = (await r.json().catch(() => ({}))) as { error_code?: unknown; code?: unknown };
      const codigo = cuerpo.error_code ?? cuerpo.code;
      if (codigo === 'email_exists' || codigo === 'user_already_exists') {
        return { ok: false, motivo: 'DUPLICADO' };
      }
      this.bitacora.registrar('aviso', 'el proveedor rechazó el alta', {
        estado: r.status,
        codigo: typeof codigo === 'string' ? codigo : 'desconocido',
      });
      return { ok: false, motivo: 'PROVEEDOR' };
    }
    if (!r.ok) throw this.fallo('alta de cuenta', r.status);
    const cuerpo = (await r.json()) as { id?: unknown };
    if (typeof cuerpo.id !== 'string')
      throw this.fallo('alta de cuenta: sin identificador', r.status);
    return { ok: true, authUserId: cuerpo.id };
  }

  async fijarContrasena(authUserId: string, contrasena: string): Promise<void> {
    const r = await fetch(`${this.base}/admin/users/${encodeURIComponent(authUserId)}`, {
      method: 'PUT',
      headers: this.secretas(),
      body: JSON.stringify({ password: contrasena }),
    });
    if (!r.ok) throw this.fallo('cambio de contraseña', r.status);
  }

  async eliminar(authUserId: string): Promise<void> {
    const r = await fetch(`${this.base}/admin/users/${encodeURIComponent(authUserId)}`, {
      method: 'DELETE',
      headers: this.secretas(),
    });
    if (!r.ok && r.status !== 404) {
      // No se relanza: es una compensación, y el error original es el que importa.
      this.bitacora.registrar('error', 'no se pudo compensar un alta de cuenta', {
        estado: r.status,
      });
    }
  }

  private publicas(): Record<string, string> {
    return { apikey: this.config.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  }

  private secretas(): Record<string, string> {
    return {
      apikey: this.config.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${this.config.SUPABASE_SECRET_KEY}`,
      'Content-Type': 'application/json',
    };
  }

  private fallo(que: string, estado: number): Error {
    this.bitacora.registrar('error', `proveedor de identidad: ${que}`, { estado });
    return new Error('No se pudo contactar con el proveedor de identidad');
  }
}

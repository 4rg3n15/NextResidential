import { randomUUID } from 'node:crypto';
import type {
  AdministradorDeCuentas,
  ProveedorDeIdentidad,
  SesionEmitida,
} from '../../src/cuentas';
import type { Firmante } from '../utilidades';

/**
 * EL PROVEEDOR DE IDENTIDAD FALSO · lo único de la cadena que no es real.
 *
 * Sustituye a Supabase Auth —que la suite no puede alcanzar— y NADA MÁS: el
 * caso de uso, la guarda, el repositorio y la sesión de portería son los de
 * producción. Emite tokens firmados con la clave de la suite, con un
 * `session_id` nuevo por inicio de sesión (como Supabase), y los claims que le
 * da `claimsDe`: en la suite en memoria, los del doble de cuentas; contra
 * base real, los del GANCHO de la base (`custom_access_token_hook`).
 *
 * Guarda los correos que recibe para que la suite compruebe que el sintético
 * llegó AQUÍ —al proveedor— y a ningún otro sitio.
 */
export class ProveedorDeIdentidadFalso implements ProveedorDeIdentidad, AdministradorDeCuentas {
  private readonly porCorreo = new Map<string, { authUserId: string; contrasena: string }>();
  readonly revocados: string[] = [];
  readonly correosRecibidos: string[] = [];

  constructor(
    private readonly firmante: Firmante,
    private readonly claimsDe: (authUserId: string) => Promise<Record<string, unknown> | null>,
  ) {}

  declarar(correo: string, contrasena: string, authUserId = randomUUID()): string {
    this.porCorreo.set(correo.toLowerCase(), { authUserId, contrasena });
    return authUserId;
  }

  contrasenaDe(authUserId: string): string | undefined {
    return [...this.porCorreo.values()].find((c) => c.authUserId === authUserId)?.contrasena;
  }

  async iniciarSesion(correo: string, contrasena: string): Promise<SesionEmitida | null> {
    this.correosRecibidos.push(correo);
    const cuenta = this.porCorreo.get(correo.toLowerCase());
    if (cuenta === undefined || cuenta.contrasena !== contrasena) return null;
    const claims = (await this.claimsDe(cuenta.authUserId)) ?? {};
    const sesionId = randomUUID();
    const accessToken = await this.firmante.emitir({
      sub: cuenta.authUserId,
      session_id: sesionId,
      aal: 'aal1',
      ...claims,
    });
    return { accessToken, refreshToken: `refresco-${sesionId}`, expiraEn: 4_102_444_800 };
  }

  async cerrarSesion(accessToken: string): Promise<void> {
    this.revocados.push(accessToken);
  }

  async crear(correo: string, contrasena: string) {
    this.correosRecibidos.push(correo);
    if (this.porCorreo.has(correo.toLowerCase()))
      return { ok: false as const, motivo: 'DUPLICADO' as const };
    return { ok: true as const, authUserId: this.declarar(correo, contrasena) };
  }

  async fijarContrasena(authUserId: string, contrasena: string): Promise<void> {
    for (const [correo, c] of this.porCorreo) {
      if (c.authUserId === authUserId) this.porCorreo.set(correo, { ...c, contrasena });
    }
  }

  async eliminar(authUserId: string): Promise<void> {
    for (const [correo, c] of this.porCorreo)
      if (c.authUserId === authUserId) this.porCorreo.delete(correo);
  }
}

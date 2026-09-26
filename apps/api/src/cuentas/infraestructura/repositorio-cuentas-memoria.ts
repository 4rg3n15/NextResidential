import { randomUUID } from 'node:crypto';
import type { Rol } from '../../autenticacion';
import type { NombreDeUsuario } from '../dominio/nombre-de-usuario';
import type {
  AltaDeCuenta,
  DirectorioDeCuentas,
  IdentidadDeCuenta,
  RepositorioDeCuentas,
  ResumenDeCuenta,
} from '../aplicacion/puertos';

interface CuentaGuardada extends IdentidadDeCuenta {
  readonly debeCambiarContrasena: boolean;
  readonly nombre: string;
  readonly telefono: string | null;
}

/**
 * Doble de la suite y del ensayo sin base. Guarda lo mismo que la tabla —sin
 * correo sintético, que tampoco está allí— y aplica la unicidad del nombre por
 * copropiedad sin distinguir mayúsculas, como el `citext` de la 0037.
 */
export class RepositorioDeCuentasEnMemoria implements RepositorioDeCuentas, DirectorioDeCuentas {
  private readonly cuentas = new Map<string, CuentaGuardada>();
  private readonly nits = new Map<string, string>();

  /** Para sembrar desde la suite: una copropiedad con su NIT. */
  declararCopropiedad(nit: string, copropiedadId: string): void {
    this.nits.set(nit, copropiedadId);
  }

  /** Para sembrar desde la suite: una cuenta por correo, como las anteriores a 15-H. */
  declararCuentaPorCorreo(c: {
    usuarioId: string;
    authUserId: string;
    copropiedadId: string | null;
    rol: Rol;
    correo: string;
  }): void {
    this.cuentas.set(c.usuarioId, {
      usuarioId: c.usuarioId,
      authUserId: c.authUserId,
      copropiedadId: c.copropiedadId,
      rol: c.rol,
      acceso: { tipo: 'correo', correo: c.correo },
      debeCambiarContrasena: false,
      nombre: c.correo,
      telefono: null,
    });
  }

  /** Para el proveedor falso de la suite: los claims que emitiría el gancho 0024/0037. */
  claimsDe(authUserId: string): Record<string, unknown> | null {
    const c = [...this.cuentas.values()].find((x) => x.authUserId === authUserId);
    if (c === undefined || c.rol === null) return null;
    return {
      usuario_id: c.usuarioId,
      rol: c.rol,
      copropiedad_id: c.rol === 'superadministrador' ? null : c.copropiedadId,
      ...(c.debeCambiarContrasena ? { debe_cambiar_contrasena: true } : {}),
    };
  }

  cambioPendiente(usuarioId: string): boolean {
    return this.cuentas.get(usuarioId)?.debeCambiarContrasena ?? false;
  }

  async copropiedadPorNit(nit: string): Promise<string | null> {
    return this.nits.get(nit) ?? null;
  }

  async identidadDe(usuarioId: string): Promise<IdentidadDeCuenta | null> {
    return this.cuentas.get(usuarioId) ?? null;
  }

  async existeNombre(copropiedadId: string, usuario: NombreDeUsuario): Promise<boolean> {
    return [...this.cuentas.values()].some(
      (c) =>
        c.copropiedadId === copropiedadId &&
        c.acceso.tipo === 'usuario' &&
        c.acceso.usuario.toLowerCase() === usuario.toLowerCase(),
    );
  }

  async crearPorNombre(alta: AltaDeCuenta): Promise<string | null> {
    if (await this.existeNombre(alta.copropiedadId, alta.usuario)) return null;
    const usuarioId = randomUUID();
    this.cuentas.set(usuarioId, {
      usuarioId,
      authUserId: alta.authUserId,
      copropiedadId: alta.copropiedadId,
      rol: alta.rol,
      acceso: { tipo: 'usuario', usuario: alta.usuario },
      debeCambiarContrasena: true,
      nombre: alta.nombre,
      telefono: alta.telefono,
    });
    return usuarioId;
  }

  async fijarCambioObligatorio(usuarioId: string, pendiente: boolean): Promise<void> {
    const c = this.cuentas.get(usuarioId);
    if (c !== undefined) this.cuentas.set(usuarioId, { ...c, debeCambiarContrasena: pendiente });
  }

  async resumenes(
    copropiedadId: string,
    usuarioIds: readonly string[],
  ): Promise<readonly ResumenDeCuenta[]> {
    return usuarioIds.flatMap((id) => {
      const c = this.cuentas.get(id);
      if (c === undefined || c.copropiedadId !== copropiedadId) return [];
      return [
        {
          usuarioId: c.usuarioId,
          usuario: c.acceso.tipo === 'usuario' ? c.acceso.usuario : null,
          nombre: c.nombre,
          telefono: c.telefono,
          activa: true,
          debeCambiarContrasena: c.debeCambiarContrasena,
        },
      ];
    });
  }

  async actualizarDatos(
    copropiedadId: string,
    usuarioId: string,
    datos: { readonly nombre: string; readonly telefono: string | null },
  ): Promise<boolean> {
    const c = this.cuentas.get(usuarioId);
    if (c === undefined || c.copropiedadId !== copropiedadId) return false;
    this.cuentas.set(usuarioId, { ...c, nombre: datos.nombre, telefono: datos.telefono });
    return true;
  }
}

import { randomUUID } from 'node:crypto';
import type { Rol } from '../../autenticacion';
import type { NombreDeUsuario } from '../dominio/nombre-de-usuario';
import type {
  AccesoDeCuenta,
  AltaDeCuenta,
  AltaEnBase,
  DirectorioDeCuentas,
  IdentidadDeCuenta,
  RepositorioDeCuentas,
  ResumenDeCuenta,
} from '../aplicacion/puertos';

interface CuentaGuardada extends IdentidadDeCuenta {
  readonly debeCambiarContrasena: boolean;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly numeroDePortero?: number;
  /** H2 (15-L) · `false` tras la baja: la fila se queda, el número también. */
  readonly activa?: boolean;
}

/** H1 · el pool en memoria: el mismo contrato que la tabla de la 0042. */
interface PoolEnMemoria {
  readonly inicio: number;
  readonly fin: number;
  siguiente: number;
  cupo: number;
}

/**
 * Doble de la suite y del ensayo sin base. Guarda lo mismo que la tabla —sin
 * correo sintético, que tampoco está allí— y aplica la unicidad del nombre por
 * copropiedad sin distinguir mayúsculas, como el `citext` de la 0037.
 */
export class RepositorioDeCuentasEnMemoria implements RepositorioDeCuentas, DirectorioDeCuentas {
  private readonly cuentas = new Map<string, CuentaGuardada>();
  private readonly codigos = new Map<string, string>();
  private readonly pools = new Map<string, PoolEnMemoria>();

  /** H1 · el pool de una copropiedad; se asigna al primer uso, en orden (1001, 2001…). */
  poolDe(copropiedadId: string): PoolEnMemoria {
    let pool = this.pools.get(copropiedadId);
    if (pool === undefined) {
      const n = this.pools.size + 1;
      pool = { inicio: n * 1000 + 1, fin: n * 1000 + 999, siguiente: n * 1000 + 1, cupo: 999 };
      this.pools.set(copropiedadId, pool);
    }
    return pool;
  }

  /** Para sembrar desde la suite: el código corto de una copropiedad (D1). */
  declararCodigo(codigo: string, copropiedadId: string): void {
    this.codigos.set(codigo, copropiedadId);
  }

  /** Para sembrar desde la suite: una cuenta por correo, como las anteriores a 15-H. */
  declararCuentaPorCorreo(c: {
    usuarioId: string;
    authUserId: string;
    copropiedadId: string | null;
    rol: Rol;
    correo: string;
    /** Un portero por correo anterior a la 15-H recibe número en la 0042. */
    numeroDePortero?: number;
  }): void {
    if (c.numeroDePortero !== undefined && c.copropiedadId !== null) this.poolDe(c.copropiedadId);
    this.cuentas.set(c.usuarioId, {
      usuarioId: c.usuarioId,
      authUserId: c.authUserId,
      copropiedadId: c.copropiedadId,
      rol: c.rol,
      acceso: { tipo: 'correo', correo: c.correo },
      debeCambiarContrasena: false,
      nombre: c.correo,
      telefono: null,
      ...(c.numeroDePortero === undefined ? {} : { numeroDePortero: c.numeroDePortero }),
    });
  }

  /** Para el proveedor falso de la suite: los claims que emitiría el gancho 0024/0037. */
  claimsDe(authUserId: string): Record<string, unknown> | null {
    const c = [...this.cuentas.values()].find((x) => x.authUserId === authUserId);
    if (c === undefined || c.rol === null || c.activa === false) return null;
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

  async copropiedadPorCodigo(codigo: string): Promise<string | null> {
    return this.codigos.get(codigo) ?? null;
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

  async crearPorNombre(alta: AltaDeCuenta): Promise<AltaEnBase> {
    if (await this.existeNombre(alta.copropiedadId, alta.usuario)) {
      return { ok: false, motivo: 'DUPLICADO' };
    }
    let numeroDePortero: number | null = null;
    if (alta.rol === 'portero') {
      const pool = this.poolDe(alta.copropiedadId);
      const activos = [...this.cuentas.values()].filter(
        (c) => c.copropiedadId === alta.copropiedadId && c.rol === 'portero' && c.activa !== false,
      ).length;
      if (activos >= pool.cupo) return { ok: false, motivo: 'CUPO' };
      if (pool.siguiente > pool.fin) return { ok: false, motivo: 'POOL_AGOTADO' };
      numeroDePortero = pool.siguiente;
      pool.siguiente += 1;
    }
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
      ...(numeroDePortero === null ? {} : { numeroDePortero }),
    });
    return { ok: true, usuarioId, numeroDePortero };
  }

  async cuentaDePortero(
    numero: number,
  ): Promise<{ readonly copropiedadId: string; readonly acceso: AccesoDeCuenta } | null> {
    const copropiedadId = [...this.pools.entries()].find(
      ([, p]) => numero >= p.inicio && numero <= p.fin,
    )?.[0];
    if (copropiedadId === undefined) return null;
    const c = [...this.cuentas.values()].find(
      (x) => x.copropiedadId === copropiedadId && x.numeroDePortero === numero,
    );
    return c === undefined ? null : { copropiedadId, acceso: c.acceso };
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
          numeroDePortero: c.numeroDePortero ?? null,
          nombre: c.nombre,
          telefono: c.telefono,
          activa: c.activa !== false,
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

  async darDeBaja(copropiedadId: string, usuarioId: string): Promise<boolean> {
    const c = this.cuentas.get(usuarioId);
    if (c === undefined || c.copropiedadId !== copropiedadId || c.activa === false) return false;
    this.cuentas.set(usuarioId, { ...c, activa: false });
    return true;
  }
}

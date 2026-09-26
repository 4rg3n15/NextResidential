import type { Rol } from '../../autenticacion';
import type { CorreoSintetico } from '../dominio/correo-sintetico';
import type { NombreDeUsuario } from '../dominio/nombre-de-usuario';

/**
 * Puertos del módulo de cuentas (ADR-023).
 *
 * Tres familias y ninguna mezclada: el PROVEEDOR de identidad (emite y revoca
 * sesiones), su ADMINISTRACIÓN (crea cuentas y fija contraseñas con la llave
 * secreta) y el REPOSITORIO propio (`usuarios`). Separarlas es ISP y es
 * también auditoría: la ETAPA 13 puede mirar un solo puerto para ver todo lo
 * que la API hace con la llave secreta del proveedor.
 */

/** Lo que el proveedor entrega al verificar una contraseña. Nada más sale. */
export interface SesionEmitida {
  readonly accessToken: string;
  readonly refreshToken: string;
  /** Segundos Unix. */
  readonly expiraEn: number;
}

export interface ProveedorDeIdentidad {
  /** `null` si la pareja no es válida. Nunca distingue «no existe» de «no coincide». */
  iniciarSesion(correo: string, contrasena: string): Promise<SesionEmitida | null>;
  /** Revoca la sesión a la que pertenece ese token. Idempotente. */
  cerrarSesion(accessToken: string): Promise<void>;
}
export const PROVEEDOR_DE_IDENTIDAD = Symbol.for('ncr.puerto.ProveedorDeIdentidad');

export interface AdministradorDeCuentas {
  /** El correo es SIEMPRE sintético: el alta por correo real no pasa por aquí. */
  crear(correo: CorreoSintetico, contrasena: string): Promise<CuentaCreada>;
  fijarContrasena(authUserId: string, contrasena: string): Promise<void>;
  /** Compensación de un alta que no llegó a la base. */
  eliminar(authUserId: string): Promise<void>;
}
export const ADMINISTRADOR_DE_CUENTAS = Symbol.for('ncr.puerto.AdministradorDeCuentas');

export type CuentaCreada =
  | { readonly ok: true; readonly authUserId: string }
  | { readonly ok: false; readonly motivo: 'DUPLICADO' | 'PROVEEDOR' };

/** Claims que la API necesita leer de un token recién emitido. */
export interface IdentidadDelToken {
  readonly usuarioId: string;
  readonly rol: Rol;
  readonly copropiedadId: string | null;
  readonly sesionId: string | null;
  readonly debeCambiarContrasena: boolean;
}
export interface LectorDeToken {
  /** `null` si el token no trae los claims del gancho: la cuenta no tiene acceso. */
  leer(accessToken: string): Promise<IdentidadDelToken | null>;
}
export const LECTOR_DE_TOKEN = Symbol.for('ncr.puerto.LectorDeToken');

/** Cómo entra una cuenta: por su correo real o por su nombre de usuario. */
export type AccesoDeCuenta =
  | { readonly tipo: 'correo'; readonly correo: string }
  | { readonly tipo: 'usuario'; readonly usuario: NombreDeUsuario };

export interface IdentidadDeCuenta {
  readonly usuarioId: string;
  readonly authUserId: string;
  readonly copropiedadId: string | null;
  /** El más privilegiado de los vigentes, con la precedencia del gancho (0024). */
  readonly rol: Rol | null;
  readonly acceso: AccesoDeCuenta;
}

export interface AltaDeCuenta {
  readonly authUserId: string;
  readonly copropiedadId: string;
  readonly usuario: NombreDeUsuario;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly rol: 'portero' | 'residente';
}

export interface RepositorioDeCuentas {
  copropiedadPorNit(nit: string): Promise<string | null>;
  /** D1 · el código ya normalizado (`codigoCorto`); sólo copropiedades activas. */
  copropiedadPorCodigo(codigo: string): Promise<string | null>;
  identidadDe(usuarioId: string): Promise<IdentidadDeCuenta | null>;
  existeNombre(copropiedadId: string, usuario: NombreDeUsuario): Promise<boolean>;
  /**
   * `usuarios` + `roles_usuario` en una transacción, con el cambio obligatorio
   * activo. `null` si el índice único rechazó el nombre (alta simultánea).
   */
  crearPorNombre(alta: AltaDeCuenta, actorId: string): Promise<string | null>;
  fijarCambioObligatorio(usuarioId: string, pendiente: boolean, actorId: string): Promise<void>;
}
export const REPOSITORIO_DE_CUENTAS = Symbol.for('ncr.puerto.RepositorioDeCuentas');

/** Desde dónde se pidió: dirección que llama, la que declara la consola y agente. */
export interface OrigenDeAcceso {
  readonly ip: string | null;
  readonly declarado: string | null;
  readonly agente: string | null;
}

/**
 * EL GANCHO DE SESIÓN · lo que otro módulo impone al entrar, salir o
 * restablecer (ADR-024). Portería lo implementa para el portero: sin turno
 * vigente no hay sesión. Cuentas no sabe qué es un turno.
 */
export type VeredictoDeSesion =
  | { readonly permitido: true }
  | { readonly permitido: false; readonly motivo: string };

export interface GanchoDeSesion {
  alIniciar(e: {
    readonly usuarioId: string;
    readonly copropiedadId: string;
    readonly sesionId: string;
    readonly origen: OrigenDeAcceso;
  }): Promise<VeredictoDeSesion>;
  alCerrar(e: {
    readonly usuarioId: string;
    readonly copropiedadId: string;
    readonly sesionId: string;
  }): Promise<void>;
  alRestablecer(e: {
    readonly usuarioId: string;
    readonly copropiedadId: string;
    readonly actorId: string;
  }): Promise<void>;
}

/**
 * Registro de ganchos por rol. Un REGISTRO y no una inyección directa porque
 * portería depende de cuentas (crea las cuentas de los porteros) y no puede
 * ser, a la vez, dependencia suya. Portería se inscribe al arrancar.
 *
 * **Falla cerrado.** Un rol listado en `ROLES_CON_GANCHO_OBLIGATORIO` sin
 * gancho inscrito NO inicia sesión: si portería no arrancara, un portero no
 * entraría sin turno por descuido del cableado.
 */
export interface GanchosDeSesion {
  inscribir(rol: Rol, gancho: GanchoDeSesion): void;
  de(rol: Rol): GanchoDeSesion | undefined;
}
export const GANCHOS_DE_SESION = Symbol.for('ncr.puerto.GanchosDeSesion');
export const ROLES_CON_GANCHO_OBLIGATORIO: readonly Rol[] = ['portero'];

/** Tiempo mínimo uniforme de un fallo de acceso (ADR-023). */
export interface IgualadorDeTiempo {
  esperarHasta(inicioMs: number, minimoMs: number): Promise<void>;
  ahoraMs(): number;
}
export const IGUALADOR_DE_TIEMPO = Symbol.for('ncr.puerto.IgualadorDeTiempo');

/** Lo que otro módulo puede saber de una cuenta: nunca su correo ni su identidad del proveedor. */
export interface ResumenDeCuenta {
  readonly usuarioId: string;
  readonly usuario: string | null;
  readonly nombre: string;
  readonly telefono: string | null;
  readonly activa: boolean;
  readonly debeCambiarContrasena: boolean;
}

export interface DirectorioDeCuentas {
  resumenes(
    copropiedadId: string,
    usuarioIds: readonly string[],
  ): Promise<readonly ResumenDeCuenta[]>;
  actualizarDatos(
    copropiedadId: string,
    usuarioId: string,
    datos: { readonly nombre: string; readonly telefono: string | null },
    actorId: string,
  ): Promise<boolean>;
}
export const DIRECTORIO_DE_CUENTAS = Symbol.for('ncr.puerto.DirectorioDeCuentas');

import type { Franja } from '../dominio/turno';
import type { CambioDeSesion, SesionDePorteria } from '../dominio/sesion-de-porteria';

/** Datos del portero que registra el superadministrador (E-02). Sectores INFORMATIVOS (P-17). */
export interface PerfilDePortero {
  readonly usuarioId: string;
  readonly copropiedadId: string;
  readonly porteria: string | null;
  readonly sectores: readonly string[];
  readonly correoContacto: string | null;
}

export interface RepositorioDePerfiles {
  perfilDe(copropiedadId: string, usuarioId: string): Promise<PerfilDePortero | null>;
  perfiles(copropiedadId: string): Promise<readonly PerfilDePortero[]>;
  /** Inserta o actualiza. */
  guardar(perfil: PerfilDePortero, actorId: string): Promise<void>;
}
export const REPOSITORIO_DE_PERFILES = Symbol.for('ncr.puerto.RepositorioDePerfilesDePortero');

export type TipoDeTurno = 'programado' | 'extra';

export interface DatosDeTurno {
  readonly porteroId: string;
  readonly porteria: string | null;
  /** `YYYY-MM-DD`, en la zona de la copropiedad. */
  readonly dia: string;
  /** `HH:MM`. Si `horaFin <= horaInicio`, cruza la medianoche. */
  readonly horaInicio: string;
  readonly horaFin: string;
  readonly tipo: TipoDeTurno;
  readonly motivo: string | null;
}

export interface TurnoRegistrado extends DatosDeTurno {
  readonly id: string;
  readonly copropiedadId: string;
  readonly franja: Franja;
  readonly activo: boolean;
}

export interface RepositorioDeTurnos {
  /** El turno ACTIVO del portero cuya franja contiene el instante, si hay. */
  vigenteDe(
    copropiedadId: string,
    porteroId: string,
    instante: Date,
  ): Promise<TurnoRegistrado | null>;
  porId(copropiedadId: string, turnoId: string): Promise<TurnoRegistrado | null>;
  /** Turnos ACTIVOS cuya franja se solapa con `[desde, hasta)`. */
  entre(copropiedadId: string, desde: Date, hasta: Date): Promise<readonly TurnoRegistrado[]>;
  /**
   * Crea (sin `id`) o actualiza (con `id`). La `franja` la recalcula la base
   * en PostgreSQL; el doble usa la que se le pasa, calculada por el dominio.
   */
  guardar(
    copropiedadId: string,
    turno: DatosDeTurno & { readonly id?: string; readonly franja: Franja },
    actorId: string,
  ): Promise<TurnoRegistrado | null>;
  retirar(
    copropiedadId: string,
    turnoId: string,
    motivo: string,
    actorId: string,
    ahora: Date,
  ): Promise<boolean>;
}
export const REPOSITORIO_DE_TURNOS = Symbol.for('ncr.puerto.RepositorioDeTurnos');

export interface NuevaSesion {
  readonly sesionId: string;
  readonly copropiedadId: string;
  readonly porteroId: string;
  readonly turnoId: string;
  readonly codigoHash: string;
  readonly iniciadaEn: Date;
  readonly origen: {
    readonly ip: string | null;
    readonly declarado: string | null;
    readonly agente: string | null;
  };
}

export interface RepositorioDeSesiones {
  de(copropiedadId: string, sesionId: string): Promise<SesionDePorteria | null>;
  abrir(nueva: NuevaSesion): Promise<void>;
  /** Aplica el cambio SOLO si la sesión no está cerrada; devuelve la sesión resultante. */
  actualizar(
    copropiedadId: string,
    sesionId: string,
    cambio: CambioDeSesion,
    actorId: string,
  ): Promise<SesionDePorteria | null>;
  /**
   * Suma un intento fallido de forma ATÓMICA (dos intentos simultáneos no
   * leen el mismo contador) y devuelve el total, o `null` si no estaba en patrullaje.
   */
  registrarIntentoFallido(
    copropiedadId: string,
    sesionId: string,
    actorId: string,
  ): Promise<number | null>;
  /** Sesiones no cerradas; de un portero, o de toda la copropiedad. */
  abiertas(copropiedadId: string, porteroId?: string): Promise<readonly SesionDePorteria[]>;
}
export const REPOSITORIO_DE_SESIONES = Symbol.for('ncr.puerto.RepositorioDeSesionesDePorteria');

/** El código de patrullaje: se deriva, se muestra y sólo se guarda su hash (S-48). */
export interface CodigoDePatrullaje {
  derivar(copropiedadId: string, turnoId: string, porteroId: string): string;
  hash(codigo: string): Promise<string>;
  coincide(codigo: string, hash: string): Promise<boolean>;
}
export const CODIGO_DE_PATRULLAJE = Symbol.for('ncr.puerto.CodigoDePatrullaje');

/** Zona horaria de la copropiedad, para calcular franjas. */
export interface ZonasHorarias {
  de(copropiedadId: string): Promise<string | null>;
}
export const ZONAS_HORARIAS = Symbol.for('ncr.puerto.ZonasHorarias');

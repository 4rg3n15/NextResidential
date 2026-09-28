/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PLATAFORMA · ETAPA 15-L (H) · ADR-031
 *
 * Lo que es de TODA la plataforma y no de un módulo de negocio: el modo
 * pruebas, dónde puede entrar un portero, desde dónde está conectado el
 * superadministrador y los intentos fallidos de acceso. Cuatro puertos
 * pequeños (ISP), cada uno con su razón de cambiar.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** H5 · el interruptor global. */
export interface AjustesDePlataforma {
  modoPruebas(): Promise<boolean>;
  /** Cambia el interruptor y deja el rastro en `auditoria_seguridad`, en una transacción. */
  fijarModoPruebas(activo: boolean, actorId: string, ip: string | null): Promise<void>;
}
export const AJUSTES_DE_PLATAFORMA = Symbol.for('ncr.puerto.AjustesDePlataforma');

/** H4 · las IP (o redes CIDR) de una copropiedad, como texto. */
export interface ReglasDeIp {
  readonly ipsPorteria: readonly string[];
  readonly ipsRemotas: readonly string[];
}
export interface RepositorioDeReglasDeIp {
  de(copropiedadId: string): Promise<ReglasDeIp>;
}
export const REPOSITORIO_DE_REGLAS_DE_IP = Symbol.for('ncr.puerto.RepositorioDeReglasDeIp');

/** H4 b · de dónde está conectado cada superadministrador. */
export interface RegistroDePresencia {
  anotar(p: {
    readonly sesionId: string;
    readonly usuarioId: string;
    readonly ip: string;
    readonly ahora: Date;
  }): Promise<void>;
  cerrar(sesionId: string, ahora: Date): Promise<void>;
  /** IPs de las sesiones abiertas con actividad desde `desde`. */
  ipsActivas(desde: Date): Promise<readonly string[]>;
}
export const REGISTRO_DE_PRESENCIA = Symbol.for('ncr.puerto.RegistroDePresencia');

export type TipoDeEventoDeSeguridad =
  | 'restriccion_de_ip'
  | 'login_fallido'
  | 'cambio_configuracion';

export interface EventoDeSeguridad {
  readonly tipo: TipoDeEventoDeSeguridad;
  readonly copropiedadId: string | null;
  readonly usuarioId: string | null;
  readonly recurso: string;
  readonly identificador: string | null;
  readonly ip: string | null;
  readonly agente: string | null;
  readonly resultado: '401' | '403' | '429' | 'permitido';
  /** Del reloj de la API: el contador de fallos se mide con el mismo reloj. */
  readonly ocurridoEn: Date;
}

/** Lo que va a `auditoria_seguridad`, append-only (ADR-05). */
export interface RegistroDeSeguridad {
  registrar(e: EventoDeSeguridad): Promise<void>;
  /** Intentos fallidos de ESTE identificador desde ESTA IP, desde `desde`. */
  fallosRecientes(ip: string, identificador: string, desde: Date): Promise<number>;
}
export const REGISTRO_DE_SEGURIDAD = Symbol.for('ncr.puerto.RegistroDeSeguridad');

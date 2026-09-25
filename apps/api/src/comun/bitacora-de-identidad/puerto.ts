/**
 * LA BITÁCORA DE IDENTIDAD Y PORTERÍA · rastro append-only (ADR-024).
 *
 * Es fontanería compartida —como `auditoria_seguridad`— y no un módulo, porque
 * la escriben dos: cuentas (cambios y restablecimientos de contraseña) y
 * portería (sesiones, patrullajes, turnos, altas). Y la lee el panel del
 * superadministrador. Una sola instancia en memoria para la suite y una sola
 * tabla en la base: `bitacora_de_porteria`, protegida como `eventos` (ADR-005).
 */
export const TIPOS_DE_HECHO = [
  'inicio_de_sesion',
  'acceso_rechazado',
  'cierre_de_sesion',
  'inicio_de_patrullaje',
  'fin_de_patrullaje',
  'codigo_incorrecto',
  'turno_asignado',
  'turno_extra',
  'turno_editado',
  'turno_retirado',
  'solape_de_turno',
  'alta_de_portero',
  'edicion_de_portero',
  'restablecimiento_de_contrasena',
  'cambio_de_contrasena',
] as const;
export type TipoDeHecho = (typeof TIPOS_DE_HECHO)[number];

export interface OrigenDelHecho {
  readonly ip: string | null;
  readonly declarado: string | null;
  readonly agente: string | null;
}

export interface HechoDeIdentidad {
  readonly tipo: TipoDeHecho;
  readonly copropiedadId: string;
  readonly ocurridoEn: Date;
  /** Sobre quién. */
  readonly usuarioId: string | null;
  /** Quién lo hizo. Para un inicio de sesión, el mismo; para un restablecimiento, el operador. */
  readonly actorId: string | null;
  readonly sesionId?: string | null;
  readonly turnoId?: string | null;
  readonly duracionSegundos?: number | null;
  readonly origen?: OrigenDelHecho | null;
  readonly detalle?: string | null;
}

export interface HechoRegistrado extends HechoDeIdentidad {
  readonly id: string;
}

export interface ConsultaDeHechos {
  readonly copropiedadId: string;
  readonly desde: Date;
  readonly hasta: Date;
  readonly tipos?: readonly TipoDeHecho[];
  readonly limite: number;
}

export interface BitacoraDeIdentidad {
  anotar(hecho: HechoDeIdentidad): Promise<void>;
  /** Más reciente primero, acotado por `limite`. */
  consultar(consulta: ConsultaDeHechos): Promise<readonly HechoRegistrado[]>;
}

export const BITACORA_DE_IDENTIDAD = Symbol.for('ncr.puerto.BitacoraDeIdentidad');

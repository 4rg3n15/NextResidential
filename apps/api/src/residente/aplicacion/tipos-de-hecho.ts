/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS HECHOS DE LA BITÁCORA DE RESIDENTES · 15-I (0038) · 15-W (0055) · 15-X (0057)
 *
 * Uno por fila de la restricción `bitacora_residentes_tipo`: si se añade aquí y
 * no allí, la base lo rechaza; si se añade allí y no aquí, nadie lo escribe.
 *
 * Desde la 15-W la bitácora anota también hechos SIN cuenta —los códigos
 * fallidos de «Crear cuenta» ocurren antes de que exista— y sin actor humano:
 * `actorId` nulo, y la fila la firma el actor de ingesta. En `detalle` va, como
 * mucho, un HMAC de la IP (`ip:…`): nunca la IP, el documento ni el código.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type TipoDeHechoDeResidente =
  // 0038 (15-I)
  | 'alta_de_cuenta'
  | 'vinculacion'
  | 'vinculacion_rechazada'
  | 'codigo_incorrecto'
  | 'vinculacion_bloqueada'
  | 'cambio_de_vivienda'
  | 'ocupantes_declarados'
  | 'plaza_anadida'
  | 'plaza_retirada'
  | 'vehiculo_propio_registrado'
  | 'vehiculo_propio_rechazado_por_tope'
  | 'vehiculo_propio_desactivado'
  | 'perfil_editado'
  // 0055 (15-W)
  | 'autorregistro'
  | 'autorregistro_rechazado'
  | 'registro_codigo_incorrecto'
  | 'registro_suspendido_por_intentos'
  | 'registro_reanudado'
  | 'titular_asignado_por_administracion'
  | 'vivienda_asignada_por_administracion'
  | 'cuenta_bloqueada_por_edad'
  | 'menor_registrado'
  | 'menor_editado'
  | 'menor_dado_de_baja'
  | 'tope_de_plazas_cambiado'
  | 'vehiculo_propio_editado'
  | 'vehiculo_propio_borrado'
  | 'visita_revocada_por_residente'
  // 0057 (15-X) · sin bytes ni documento: a lo sumo la versión de la política
  | 'rostro_registrado'
  | 'rostro_retirado'
  | 'rostro_de_menor_registrado'
  | 'rostro_de_menor_retirado';

export interface HechoDeResidente {
  readonly copropiedadId: string;
  readonly tipo: TipoDeHechoDeResidente;
  readonly ocurridoEn: Date;
  readonly usuarioId: string | null;
  /** `null` = sin actor humano (un intento de registro anónimo). */
  readonly actorId: string | null;
  readonly viviendaId?: string | null;
  readonly vehiculoId?: string | null;
  /** Nunca el documento, el código ni la IP en claro: la bitácora es de hechos, no de secretos. */
  readonly detalle?: string | null;
}

/** Bitácora de solo inserción (0038). */
export interface BitacoraDeResidentes {
  anotar(hecho: HechoDeResidente): Promise<void>;
}

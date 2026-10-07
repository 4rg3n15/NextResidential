/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D1 · EL RESIDENTE QUE UN ROSTRO IDENTIFICA
 *
 * El derecho del residente (S-33) nacía sólo de un vehículo del padrón: el
 * rostro de quien vive en el conjunto llegaba al motor sin vivienda. Este
 * puerto dice, de una persona, de qué vivienda es residente y desde cuándo, y
 * cuándo dejó de serlo. Lo cumple `infraestructura/residentes-por-persona-pg.ts`
 * con la MISMA lectura que la instantánea del Edge (RN-16).
 *
 * Un residente de baja también se resuelve: su derecho vence en la baja y el
 * motor niega con VIGENCIA_EXPIRADA, el motivo verdadero, en vez de quedarse
 * sin vivienda y negar con FALLO_TECNICO. Con S-08 hay a lo sumo un residente
 * ACTIVO por persona; si no lo hay, el de la baja más reciente.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface ResidenteResuelto {
  readonly residenteId: string;
  readonly personaId: string;
  readonly viviendaId: string;
  readonly viviendaActiva: boolean;
  /** El alta del residente: desde cuándo rige su derecho. */
  readonly registradoEn: Date;
  /** La primera baja que lo corta —del residente, de la persona o de la vivienda—; `null` si sigue. */
  readonly bajaEn: Date | null;
}

export interface ResidentesPorPersona {
  resolver(copropiedadId: string, personaId: string): Promise<ResidenteResuelto | null>;
}

export const RESIDENTES_POR_PERSONA = Symbol.for('ncr.puerto.ResidentesPorPersona');

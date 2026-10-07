import { Autorizacion, Vigencia, esExito } from '@ncr/domain-core';
import type { PlacaResuelta } from './puertos';
import type { ResidenteResuelto } from './residentes-por-persona';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL DERECHO DEL RESIDENTE ES UNA AUTORIZACIÓN, Y SE MODELA COMO TAL
 *
 * El motor razona sobre `Autorizacion`: quién puede entrar, a qué vivienda, en
 * qué vigencia. Un vehículo del padrón no tiene fila en `autorizaciones` —el
 * residente no se autoriza a sí mismo—, pero su derecho a entrar existe y rige
 * mientras su vivienda esté en servicio. Se le entrega al motor como una
 * autorización SINTÉTICA: vigente desde que el vehículo se registró y hasta que
 * la vivienda se dio de baja (RN-13). Así el motor aplica las mismas reglas a
 * todos, y una vivienda de baja se niega por `politica.vigencia`.
 *
 * [SUPUESTO] S-33 · el contrato no tiene motivo «VIVIENDA_INACTIVA». Se usa
 * VIGENCIA_EXPIRADA con la regla `politica.vigencia`, que es literalmente lo
 * que ocurrió: el derecho venció con la baja.
 *
 * 15-Q · Salió de `CargadorDeContextoPg` para que la instantánea del Edge la
 * construya con ESTA función y no con una copia: RN-16 (la misma decisión en
 * la nube y en el Edge) se rompe en silencio el día que las dos difieren.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Cien años: «mientras la vivienda esté en servicio», sin fecha de caducidad. */
const SIN_CADUCIDAD_MS = 100 * 365 * 24 * 3600 * 1000;

/**
 * La autorización sintética, para el vehículo y para la persona: desde el alta
 * y sin caducidad, o hasta la baja. Una sola función para los dos derechos, y
 * los dos caminos —nube e instantánea del Edge— la llaman (RN-16).
 */
const derechoSintetico = (
  datos: { readonly id: string; readonly copropiedadId: string; readonly viviendaId: string },
  personaId: string,
  desde: Date,
  baja: Date | null,
): Autorizacion | null => {
  const vigencia = Vigencia.crear(desde, baja ?? new Date(desde.getTime() + SIN_CADUCIDAD_MS));
  if (!esExito(vigencia)) return null;
  const derecho = Autorizacion.crear({ ...datos, personaId, vigencia: vigencia.valor });
  return esExito(derecho) ? derecho.valor : null;
};

export const derechoDelResidente = (
  copropiedadId: string,
  vehiculo: PlacaResuelta,
): Autorizacion | null =>
  derechoSintetico(
    { id: `residente:${vehiculo.vehiculoId}`, copropiedadId, viviendaId: vehiculo.viviendaId },
    vehiculo.personaId ?? `vehiculo:${vehiculo.vehiculoId}`,
    vehiculo.registradoEn,
    vehiculo.viviendaActiva ? null : vehiculo.viviendaDesactivadaEn,
  );

/**
 * 15-X · D1 · el derecho del residente por su ROSTRO. El prefijo
 * `residente:persona:` lo distingue del del vehículo: el Edge y la nube lo
 * aplican SÓLO a un acceso facial de esa persona.
 */
export const derechoDelResidentePorPersona = (
  copropiedadId: string,
  residente: ResidenteResuelto,
): Autorizacion | null =>
  derechoSintetico(
    {
      id: `residente:persona:${residente.residenteId}`,
      copropiedadId,
      viviendaId: residente.viviendaId,
    },
    residente.personaId,
    residente.registradoEn,
    residente.bajaEn,
  );

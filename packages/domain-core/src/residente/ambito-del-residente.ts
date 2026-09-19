/**
 * El SEGUNDO EJE del aislamiento: la vivienda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ EXISTE, dicho sin rodeos
 *
 * Hasta la ETAPA 11 el aislamiento del sistema tenía un solo eje: la
 * copropiedad. Es el correcto para los cinco roles que administran u operan —un
 * administrador ve su conjunto entero, y debe—. El residente no encaja ahí: su
 * alcance legítimo es **una vivienda**, no el conjunto. Un residente que
 * alcanzara el padrón completo vería las autorizaciones, los vehículos y el
 * historial de sus vecinos, y eso es tan grave como ver los de otro conjunto
 * (RN-05, RN-15): la única diferencia es a quién se le filtra la vida privada.
 *
 * La barrera vive aquí, en el dominio, y no en un `WHERE` del repositorio, por
 * la misma razón que el motor de reglas: una comparación escrita en cada
 * consulta se olvida en la consulta número once. Aquí es una función pura, con
 * una prueba por rama, que la capa de aplicación **tiene** que atravesar porque
 * es la que construye el ámbito.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA REGLA, ENTERA
 *
 *   La vivienda del residente NUNCA llega en la petición. Se deriva de su
 *   identidad.
 *
 * Es la parte que hace innecesaria la mitad de las comprobaciones: si el
 * cliente no puede nombrar una vivienda, no puede pedir la del vecino. Lo que
 * sí puede nombrar son recursos de segundo nivel —una autorización, un evento,
 * un vehículo por su identificador—, y para esos está `alcanzaVivienda`.
 */

/** Ámbito efectivo de un residente: una copropiedad y una vivienda. */
export interface AmbitoDelResidente {
  readonly copropiedadId: string;
  readonly viviendaId: string;
}

/**
 * Recurso cuya pertenencia se juzga. `viviendaId` es nullable a propósito: en
 * `eventos` lo es (un evento de zona común puede no tener vivienda destino), y
 * un nulo **no** puede leerse como «de cualquiera».
 */
export interface RecursoDeVivienda {
  readonly copropiedadId: string;
  readonly viviendaId: string | null;
}

/**
 * ¿El recurso pertenece a la vivienda del residente?
 *
 * Deniega por defecto (§2.1.4): un recurso sin vivienda no alcanza a nadie. La
 * comparación incluye la copropiedad aunque el primer eje ya la haya validado,
 * porque un identificador de vivienda es un UUID y un UUID no lleva escrito de
 * qué conjunto es.
 */
export const alcanzaVivienda = (ambito: AmbitoDelResidente, recurso: RecursoDeVivienda): boolean =>
  recurso.viviendaId !== null &&
  recurso.copropiedadId === ambito.copropiedadId &&
  recurso.viviendaId === ambito.viviendaId;

/** Motivos por los que una identidad no tiene ámbito de residente. */
export type MotivoSinAmbito = 'sin_vivienda_activa' | 'copropiedad_distinta';

/**
 * Construye el ámbito a partir del vínculo que el directorio resolvió para la
 * identidad. Devuelve el motivo en vez de `null` para que la capa de
 * aplicación pueda distinguir «este residente no tiene vivienda asignada»
 * —estado real y previsto del mockup M-1— de «el vínculo es de otra
 * copropiedad», que es un intento de cruce y se audita.
 */
export const ambitoDelResidente = (
  copropiedadId: string,
  vinculo: { readonly copropiedadId: string; readonly viviendaId: string } | null,
):
  | { readonly ok: true; readonly ambito: AmbitoDelResidente }
  | { readonly ok: false; readonly motivo: MotivoSinAmbito } => {
  if (vinculo === null) return { ok: false, motivo: 'sin_vivienda_activa' };
  if (vinculo.copropiedadId !== copropiedadId) return { ok: false, motivo: 'copropiedad_distinta' };
  return { ok: true, ambito: { copropiedadId, viviendaId: vinculo.viviendaId } };
};

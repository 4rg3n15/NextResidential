import { ACTOR_INGESTA } from './actores-de-servicio';

/**
 * LOS CLAIMS DE SERVICIO DE UNA COPROPIEDAD.
 *
 * Es lo que el proceso presenta a PostgreSQL cuando actúa por sí mismo —sin
 * token de usuario— sobre los datos de UNA copropiedad: leer el sobre de un
 * equipo, anexar el evento que una cámara publicó, empujar una plantilla. La
 * RLS está forzada (§2.7.6) y `app.es_servicio(copropiedad_id)` exige saber
 * de qué copropiedad se trata; por eso se construyen por llamada y nunca «para
 * todas».
 *
 * Vive en `comun` porque lo necesitan módulos que no se importan entre sí
 * (equipos, eventos, biometría), y porque es fontanería sin dominio propio:
 * quien decide si la copropiedad es la correcta es la capa de aplicación,
 * antes de llegar aquí (el segundo camino de aislamiento de §2.7.6).
 */
export const claimsDeServicio = (copropiedadId: string): Record<string, unknown> => ({
  rol: 'servicio',
  usuario_id: ACTOR_INGESTA,
  copropiedad_id: copropiedadId,
  copropiedades: [copropiedadId],
});

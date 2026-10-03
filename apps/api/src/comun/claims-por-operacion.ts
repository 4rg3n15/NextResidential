import { claimsDeServicio } from './claims-de-servicio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · E2 · DT-15K-02 · CLAIMS REALES EN CADA OPERACIÓN, NO `{}`
 *
 * Ocho adaptadores se construían con claims vacíos y dependían de que la API
 * se conecte con un rol que omite la RLS (S-62): con un rol sujeto a ella se
 * habrían quedado sin filas, y la RLS no era una segunda barrera sino un
 * adorno. Ahora se construyen con `SERVICIO_POR_COPROPIEDAD` y cada operación
 * presenta los claims de servicio de SU copropiedad —la que la capa de
 * aplicación ya validó—, igual que el tablero, equipos o biometría. Quien
 * construya el adaptador con claims concretos (una prueba con los de un
 * usuario) los conserva.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const SERVICIO_POR_COPROPIEDAD = 'servicio-por-copropiedad' as const;

export type ClaimsDelAdaptador = Record<string, unknown> | typeof SERVICIO_POR_COPROPIEDAD;

/** Los claims que se fijan en la conexión para operar sobre `copropiedadId`. */
export const claimsDeLaOperacion = (
  claims: ClaimsDelAdaptador,
  copropiedadId: string,
): Record<string, unknown> =>
  claims === SERVICIO_POR_COPROPIEDAD ? claimsDeServicio(copropiedadId) : claims;

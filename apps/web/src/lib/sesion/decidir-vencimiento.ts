/**
 * Regla de renovación del token, aislada y pura para poder probarla.
 *
 * Está fuera de `token.ts` porque ese módulo es `server-only` y toca cookies y
 * red; la regla, en cambio, es aritmética. Separarlas permite comprobar los
 * bordes —el segundo exacto del margen, el reloj adelantado, el token ya
 * caducado— sin levantar un servidor.
 */

export type DecisionDeToken = 'usar' | 'renovar' | 'sin-sesion';

export interface EstadoDelToken {
  readonly hayRefresco: boolean;
  readonly accessToken: string;
  readonly expiraEn: number;
}

export const decidirToken = (
  estado: EstadoDelToken,
  ahoraSegundos: number,
  margenSegundos: number,
): DecisionDeToken => {
  if (!estado.hayRefresco) return 'sin-sesion';
  if (estado.accessToken === '') return 'renovar';
  // `>` y no `>=`: en el segundo exacto del margen ya se renueva. Apurar el
  // borde es justo lo que produce la carrera que se quiere evitar.
  return estado.expiraEn - ahoraSegundos > margenSegundos ? 'usar' : 'renovar';
};

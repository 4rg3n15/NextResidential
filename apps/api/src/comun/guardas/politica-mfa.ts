/**
 * Política del segundo factor, como puerto propio y no como «leer la
 * configuración desde el guard».
 *
 * El guard no necesita la configuración entera: necesita saber si la regla de
 * RN-20 está en vigor. Inyectarle el objeto completo le daría acceso a la llave
 * secreta y a la cadena de conexión para responder a una pregunta de sí o no, y
 * ese es exactamente el tipo de dependencia que después nadie recorta.
 */
export const POLITICA_MFA = Symbol.for('ncr.PoliticaMfa');

export interface PoliticaMfa {
  /**
   * `false` solo si alguien escribió `MFA_OBLIGATORIO=false` en el entorno.
   * El valor por defecto del esquema es `true`, así que un entorno que no
   * menciona la variable conserva el comportamiento del contrato.
   */
  readonly obligatorio: boolean;
}

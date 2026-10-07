/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · LA POLÍTICA QUE ACEPTA QUIEN REGISTRA SU ROSTRO (ADR-039)
 *
 * Ley 1581 de 2012: el dato biométrico es SENSIBLE; su tratamiento es
 * facultativo, con autorización previa, expresa e informada, y hay que poder
 * probar QUÉ texto se aceptó. La app recibe el texto y su versión del servidor
 * (`GET …/mi/rostro`) y devuelve la versión que mostró: si no es la vigente, el
 * registro no sigue (409) y la app vuelve a mostrar el texto.
 *
 * PENDIENTE DE DEFINICIÓN P-39: el texto definitivo lo redacta el área legal de
 * Grupo Control. Éste es el provisional y conservador: dice qué se trata, para
 * qué, que es opcional, cuánto dura y cómo se retira.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const VERSION_DE_LA_POLITICA_DEL_ROSTRO = 'rostro-2026-10-provisional-1';

export const TEXTO_DE_LA_POLITICA_DEL_ROSTRO =
  'Autorizo a la administración de mi copropiedad y a Next Control Residencial a tratar la ' +
  'imagen de mi rostro, dato sensible, con la única finalidad de controlar mi acceso al ' +
  'conjunto, conforme a la Ley 1581 de 2012. Es opcional: puedo entrar sin registrarlo. Se ' +
  'guarda cifrada, nunca se me devuelve ni se comparte, vence al año y puedo retirarlo cuando ' +
  'quiera desde la app: se borra de inmediato, también de los equipos de la portería.';

export const POLITICA_DEL_ROSTRO = {
  version: VERSION_DE_LA_POLITICA_DEL_ROSTRO,
  texto: TEXTO_DE_LA_POLITICA_DEL_ROSTRO,
} as const;

/**
 * 15-X · D3 · la que acepta el TITULAR del hogar como representante legal de un
 * menor de 15 a 17 años (Ley 1581, art. 7: lo autoriza su representante, oído
 * el menor). Versión propia: es otro texto, y otra la persona que lo acepta.
 * PENDIENTE DE DEFINICIÓN P-39, como la de arriba.
 */
export const VERSION_DE_LA_POLITICA_DEL_ROSTRO_DE_MENOR = 'rostro-menor-2026-10-provisional-1';

export const TEXTO_DE_LA_POLITICA_DEL_ROSTRO_DE_MENOR =
  'Como su representante legal, autorizo a la administración de mi copropiedad y a Next ' +
  'Control Residencial a tratar la imagen del rostro de este menor, dato sensible, con la ' +
  'única finalidad de controlar su acceso al conjunto, conforme a la Ley 1581 de 2012. Le ' +
  'expliqué para qué es y está de acuerdo. Es opcional: puede entrar sin registrarlo. Se ' +
  'guarda cifrada, nunca se devuelve ni se comparte, vence al año o cuando cumpla 18 años, lo ' +
  'que ocurra antes, y puedo retirarlo cuando quiera desde la app: se borra de inmediato, ' +
  'también de los equipos de la portería.';

export const POLITICA_DEL_ROSTRO_DE_MENOR = {
  version: VERSION_DE_LA_POLITICA_DEL_ROSTRO_DE_MENOR,
  texto: TEXTO_DE_LA_POLITICA_DEL_ROSTRO_DE_MENOR,
} as const;

/**
 * Capturas de rostro por CUENTA en 24 h —las propias y las de sus menores—,
 * contadas en la base (ADR-039, §2.7.5).
 */
export const CAPTURAS_DE_ROSTRO_POR_DIA = 5;

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

/** Capturas de rostro de residente por cuenta en 24 h, contadas en la base (ADR-039, §2.7.5). */
export const CAPTURAS_DE_ROSTRO_POR_DIA = 5;

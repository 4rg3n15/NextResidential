/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA POLÍTICA DE TRATAMIENTO DE DATOS QUE ACEPTA QUIEN CREA SU CUENTA · 15-W (D2)
 *
 * Ley 1581 de 2012: la autorización es previa, expresa e informada, y hay que
 * poder probar QUÉ texto se aceptó. Por eso el texto tiene versión, la app lo
 * recibe del servidor (en el 400 de `POST /auth/registro`, C-60) y devuelve la
 * versión que mostró; si no es la vigente, el registro no sigue. La versión
 * aceptada queda en la bitácora de residentes, en la fila `autorregistro`.
 *
 * PENDIENTE DE DEFINICIÓN P-37: el texto definitivo lo redacta el área legal de
 * Grupo Control. Éste es el provisional, conservador: dice qué se trata, para
 * qué y ante quién se ejercen los derechos.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const VERSION_DE_LA_POLITICA_DE_DATOS = '2026-10-provisional-1';

export const TEXTO_DE_LA_POLITICA_DE_DATOS =
  'Autorizo a la administración de mi copropiedad y a Next Control Residencial a tratar mis ' +
  'datos personales —usuario, correo, fecha de nacimiento y los que registre después— con la ' +
  'única finalidad de gestionar el acceso a mi copropiedad, conforme a la Ley 1581 de 2012. ' +
  'Puedo conocer, actualizar, rectificar y suprimir mis datos, y revocar esta autorización, ' +
  'ante la administración de mi copropiedad.';

export const POLITICA_DE_DATOS = {
  version: VERSION_DE_LA_POLITICA_DE_DATOS,
  texto: TEXTO_DE_LA_POLITICA_DE_DATOS,
} as const;

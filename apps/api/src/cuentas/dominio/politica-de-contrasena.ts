/**
 * POLÍTICA DE CONTRASEÑA · la misma que la consola (`apps/web/src/lib/
 * politica-contrasena.ts`), repetida aquí porque **la validación real es la
 * del servidor** (§2.7.3). La del formulario es cortesía; ésta decide.
 *
 * Si una de las dos cambia sin la otra, la prueba de paridad de la consola lo
 * detecta: comprueba los mismos ejemplos contra las dos.
 */
export const LONGITUD_MINIMA = 8;
export const LONGITUD_MAXIMA = 256;

const REQUISITOS: readonly { readonly texto: string; readonly cumple: (c: string) => boolean }[] = [
  {
    texto: `al menos ${LONGITUD_MINIMA} caracteres`,
    cumple: (c) => c.length >= LONGITUD_MINIMA,
  },
  { texto: 'una letra mayúscula', cumple: (c) => /\p{Lu}/u.test(c) },
  { texto: 'una letra minúscula', cumple: (c) => /\p{Ll}/u.test(c) },
  { texto: 'un número', cumple: (c) => /\p{Nd}/u.test(c) },
  { texto: 'un carácter especial', cumple: (c) => /[^\p{L}\p{Nd}\s]/u.test(c) },
];

/** `null` si cumple; si no, el motivo con TODO lo que falta. */
export const motivoDeRechazoDeContrasena = (contrasena: string): string | null => {
  if (contrasena.length > LONGITUD_MAXIMA) {
    return `La contraseña no puede superar los ${LONGITUD_MAXIMA} caracteres`;
  }
  const faltan = REQUISITOS.filter((r) => !r.cumple(contrasena)).map((r) => r.texto);
  return faltan.length === 0 ? null : `A la contraseña le falta: ${faltan.join(', ')}`;
};

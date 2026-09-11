/**
 * Política de contraseña, **en un solo sitio**.
 *
 * Antes vivía duplicada: una constante `LONGITUD_MINIMA = 12` en el formulario
 * y otra idéntica en la ruta del servidor, cada una con su comentario diciendo
 * que coincidía con la otra. Dos números que hay que acordarse de mover a la
 * vez acaban separándose, y cuando lo hacen el usuario ve una regla en pantalla
 * y otra en la respuesta. Aquí hay uno.
 *
 * **La política del panel de Supabase tiene que decir lo mismo.** Supabase
 * valida por su cuenta al cambiar la contraseña, así que si su mínimo fuera
 * distinto el usuario recibiría dos mensajes contradictorios: el nuestro
 * aceptando y el suyo rechazando. Los pasos para alinearlo están en
 * `docs/guias/RECUPERACION_Y_USUARIOS.md` §A.4.
 *
 * > **Nota de criterio, no objeción.** Bajar de 12 a 8 con reglas de
 * > composición es lo que pidió el cliente y es lo que está implementado. Queda
 * > dicho que la longitud aporta más entropía que la composición —ocho con
 * > símbolo son más débiles que doce sin él—, y que por eso el formulario
 * > sigue midiendo y mostrando la fuerza más allá del mínimo en vez de dar por
 * > buena cualquier contraseña que pase el umbral.
 */
export const LONGITUD_MINIMA = 8;
export const LONGITUD_MAXIMA = 256;

export const REQUISITOS = [
  { clave: 'longitud', texto: `Al menos ${LONGITUD_MINIMA} caracteres` },
  { clave: 'mayuscula', texto: 'Una letra mayúscula' },
  { clave: 'minuscula', texto: 'Una letra minúscula' },
  { clave: 'numero', texto: 'Un número' },
  { clave: 'especial', texto: 'Un carácter especial' },
] as const;

export type ClaveDeRequisito = (typeof REQUISITOS)[number]['clave'];

/**
 * Qué requisitos cumple una contraseña. Devuelve el mapa entero —no el primer
 * fallo— para que el formulario pueda marcarlos todos a la vez: decir «falta
 * una mayúscula», y al corregirlo «falta un número», obliga a adivinar la
 * regla a base de intentos.
 */
export const requisitosCumplidos = (
  contrasena: string,
): Readonly<Record<ClaveDeRequisito, boolean>> =>
  Object.freeze({
    longitud: contrasena.length >= LONGITUD_MINIMA && contrasena.length <= LONGITUD_MAXIMA,
    mayuscula: /\p{Lu}/u.test(contrasena),
    minuscula: /\p{Ll}/u.test(contrasena),
    numero: /\p{Nd}/u.test(contrasena),
    /**
     * «Especial» es **todo lo que no sea letra, número ni espacio**, con
     * Unicode. Una lista literal de símbolos —`!@#$%…`— rechazaría `¿`, `ñ`
     * acentuada o un guion largo, que un usuario hispanohablante teclea sin
     * pensar, y le diría que su contraseña no tiene símbolos teniéndolos.
     */
    especial: /[^\p{L}\p{Nd}\s]/u.test(contrasena),
  });

export const contrasenaValida = (contrasena: string): boolean =>
  Object.values(requisitosCumplidos(contrasena)).every(Boolean);

/**
 * Mensaje único para cuando el servidor rechaza. Enumera **lo que falta**, no
 * la política entera: repetir las cinco reglas cuando solo falla una hace que
 * el usuario relea todo para encontrar la que le atañe.
 */
export const motivoDeRechazo = (contrasena: string): string | null => {
  const cumplidos = requisitosCumplidos(contrasena);
  if (contrasena.length > LONGITUD_MAXIMA) {
    return `La contraseña no puede superar los ${LONGITUD_MAXIMA} caracteres.`;
  }
  const faltan = REQUISITOS.filter((r) => !cumplidos[r.clave]).map((r) => r.texto.toLowerCase());
  if (faltan.length === 0) return null;
  return `A la contraseña le falta: ${faltan.join(', ')}.`;
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ CARACTERES ADMITE EL EQUIPO · y por qué se comprueba ANTES de enviarlos
 *
 * El equipo rechaza un usuario o una clave con caracteres fuera de su juego. Si
 * eso se descubre en el viaje, el operador ve «el equipo rechazó la credencial»
 * —que es el mensaje de una clave equivocada— y **vuelve a intentarlo**. Estos
 * aparatos bloquean la cuenta tras unos pocos intentos fallidos, así que un
 * carácter no admitido acaba convertido en un equipo inaccesible al que hay que
 * ir físicamente.
 *
 * Rechazarlo en el formulario ahorra el viaje y, sobre todo, ahorra intentos.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * `[SUPUESTO] S-32` · EL JUEGO EXACTO NO SE TRANSCRIBIÓ, Y SE DICE
 *
 * La guía enumera los caracteres especiales en una tabla —«los 30 primeros»
 * para el usuario, «los 33» para la contraseña—, y esa tabla **no llegó a este
 * árbol**. Lo que sí se conoce y se aplica es su forma, que es lo que gobierna
 * los modos de fallo reales:
 *
 * · letras y dígitos siempre;
 * · el juego de la contraseña **contiene** al del usuario, nunca al revés;
 * · los nombres visibles admiten además **multibyte UTF-8** —acentos, ñ—, que
 *   es justo lo que un conjunto colombiano va a escribir;
 * · y ninguno admite **caracteres de control ni el byte nulo**, que es la parte
 *   que de verdad importa y no depende de ninguna tabla.
 *
 * Mientras la enumeración exacta no esté, esto es deliberadamente **más
 * permisivo** que el equipo en los especiales y **igual de estricto** en lo que
 * podría hacer daño. Un validador más estricto que el aparato rechazaría
 * credenciales legítimas, que es peor: deja al operador sin poder escribir la
 * clave que el equipo sí tiene.
 */

/**
 * Caracteres de control y byte nulo. Nunca, en ningún campo (§2.7.4).
 *
 * Se comprueba por **código de punto** y no con una clase de expresión regular
 * a propósito: escribir el rango dentro de la expresión mete caracteres de
 * control literales en el fichero fuente, que es justo lo que este control
 * persigue y lo que el linter marca. La comprobación es la misma y el fichero
 * queda legible.
 */
const esDeControl = (valor: string): boolean => {
  for (const caracter of valor) {
    const punto = caracter.codePointAt(0) ?? 0;
    if (punto < 0x20 || punto === 0x7f) return true;
  }
  return false;
};

/** Especiales imprimibles de ASCII, sin espacio. */
const ESPECIALES_BASE = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';

const juego = (conEspeciales: string): RegExp =>
  new RegExp(`^[A-Za-z0-9${conEspeciales.replace(/[\\^\]-]/g, '\\$&')}]+$`);

const USUARIO = juego(ESPECIALES_BASE);
const CLAVE = juego(`${ESPECIALES_BASE} `);

export type CampoDeEquipo = 'usuario' | 'clave' | 'nombre';

/**
 * `null` si vale; si no, el motivo **en términos del operador**.
 *
 * Los tres motivos son distintos a propósito: «tiene un carácter que el equipo
 * no admite» manda a cambiar la clave, y «está vacío» manda a escribirla. Un
 * único «valor inválido» los junta y no dice qué hacer con ninguno.
 */
export const motivoDeRechazo = (campo: CampoDeEquipo, valor: string): string | null => {
  if (valor === '') return 'Hace falta escribirlo.';
  if (esDeControl(valor)) {
    return 'Tiene caracteres de control invisibles. Suele pasar al pegar desde otro sitio: bórrelo y escríbalo a mano.';
  }
  if (campo === 'nombre') {
    // Los nombres visibles admiten multibyte: acentos y ñ son lo normal aquí.
    return null;
  }
  const admitido = campo === 'clave' ? CLAVE : USUARIO;
  if (!admitido.test(valor)) {
    return campo === 'clave'
      ? 'Tiene un carácter que el equipo no admite en la contraseña. Use letras, dígitos y signos de puntuación corrientes.'
      : 'Tiene un carácter que el equipo no admite en el usuario. Use letras, dígitos y signos de puntuación corrientes, sin espacios.';
  }
  return null;
};

export const esAdmisible = (campo: CampoDeEquipo, valor: string): boolean =>
  motivoDeRechazo(campo, valor) === null;

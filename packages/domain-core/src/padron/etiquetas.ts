/**
 * La palabra de la copropiedad, y por qué no vive dentro del identificador.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HALLAZGO H-3 DEL DISEÑO
 *
 * Si el identificador guardado fuese `"Casa 42"`, la palabra «Casa» estaría
 * dentro de 300 filas y cambiar el prefijo del conjunto sería un renombrado
 * masivo. Guardando `"42"` y pintando «Casa» al mostrar, ese cambio no toca una
 * sola fila.
 *
 * Eso es cierto **solo mientras nadie teclee la palabra a mano**, y por eso
 * estas funciones existen. Se usan en dos sitios con dos respuestas distintas,
 * y la diferencia es deliberada:
 *
 *  · **Alta individual**: se RECHAZA, con el motivo explicado. Hay una persona
 *    delante escribiendo, y decírselo una vez evita que lo repita 300.
 *  · **Importación**: se RECORTA en silencio y se cuenta. El archivo es el que
 *    el administrador ya tenía —con «Casa 42» escrito en la columna— y
 *    rechazar 300 filas por una palabra que sabemos quitar convertiría la vía
 *    más rápida de cargar el padrón en la más lenta.
 */

/**
 * Sin tildes y en minúsculas, para comparar «Sección» con «seccion».
 *
 * Los diacríticos se descartan **por punto de código** y no con un rango de
 * escape dentro de una expresión regular. Es la misma convención que sigue
 * `eventos/presentacion/formatos.ts` con los caracteres de control, y por el
 * mismo motivo: un rango escrito como escape acaba guardado como los
 * caracteres literales que representa —el formateador los normaliza— y
 * entonces el fichero depende de que nadie lo abra con la codificación
 * equivocada.
 */
const ES_DIACRITICO = (punto: number): boolean => punto >= 0x300 && punto <= 0x36f;

const plano = (texto: string): string =>
  [...texto.normalize('NFD')]
    .filter((c) => !ES_DIACRITICO(c.codePointAt(0) ?? 0))
    .join('')
    .trim()
    .toLowerCase();

/** Separadores admitidos entre la palabra y el número: espacio, guion, punto. */
const SEPARADOR = /^[\s.\-_]+/;

/**
 * Lo que queda del identificador tras quitarle la etiqueta, o `null` si no
 * empezaba por ella.
 *
 * Nunca devuelve cadena vacía: un identificador que sea **solo** la palabra
 * («Casa») no es «Casa sin número», es un identificador que hay que corregir, y
 * dejarlo en blanco lo haría pasar por válido.
 */
export const recortarEtiqueta = (identificador: string, etiqueta: string): string | null => {
  const limpio = identificador.trim();
  const palabra = etiqueta.trim();
  if (palabra.length === 0) return null;
  const planoIdentificador = plano(limpio);
  const planoEtiqueta = plano(palabra);
  if (!planoIdentificador.startsWith(planoEtiqueta)) return null;

  const resto = limpio.slice(palabra.length).replace(SEPARADOR, '');
  // Sin separador no hay prefijo: «Casablanca» empieza por «Casa» y no es
  // «la casa blanca». Se exige que lo que sigue a la palabra sea un separador
  // o nada.
  const siguiente = limpio.slice(palabra.length);
  if (siguiente.length > 0 && !SEPARADOR.test(siguiente)) return null;
  return resto.length === 0 ? null : resto;
};

/** `true` si el identificador trae la palabra dentro. */
export const empiezaPorEtiqueta = (identificador: string, etiqueta: string): boolean =>
  recortarEtiqueta(identificador, etiqueta) !== null;

/**
 * **Lo que NO vive aquí: componer «Casa 42 · Manzana B».**
 *
 * Se escribió en este fichero y el control `frontera-vocabulario.mjs` lo
 * rechazó, con razón. Componer el nombre visible es presentación: no decide
 * nada, no se persiste y no lo consulta ninguna regla. Traerlo al dominio
 * —compartido con el Edge— habría metido aquí las dos etiquetas de la
 * copropiedad, y con ellas la duda de si alguna decisión depende de una
 * palabra configurable.
 *
 * Vive en la consola (`apps/web/src/lib/vocabulario.ts`), que es quien pinta.
 * Lo que sí es del dominio es lo de arriba: que la palabra **no entre** en el
 * identificador es un invariante, y ese se comprueba aquí.
 */

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

/** Sin tildes y en minúsculas, para comparar «Sección» con «seccion». */
const plano = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

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
 * Cómo se llama una vivienda en pantalla: «Casa 42 · Manzana B».
 *
 * Se compone al mostrar, siempre. Ninguna de las dos palabras se persiste.
 */
export const nombreDeVivienda = (
  etiquetaVivienda: string,
  identificador: string,
  etiquetaAgrupacion?: string,
  agrupacion?: string | null,
): string => {
  const vivienda = `${etiquetaVivienda.trim()} ${identificador.trim()}`.trim();
  if (agrupacion === undefined || agrupacion === null || agrupacion.trim() === '') return vivienda;
  return `${vivienda} · ${(etiquetaAgrupacion ?? '').trim()} ${agrupacion.trim()}`.trim();
};

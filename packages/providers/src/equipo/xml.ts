/**
 * LECTURA DE XML DEL FABRICANTE, SIN LIBRERÍA Y CON UNA RAZÓN.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ NO HAY UN ANALIZADOR DE XML COMPLETO
 *
 * Lo mismo que ya se argumenta en `hikvision/contratos-de-evento.ts`: lo que
 * llega son documentos pequeños y de forma conocida, y un analizador completo
 * traería superficie de ataque —entidades externas, bombas de expansión— en el
 * único extremo del sistema que acepta cuerpos de un tercero sin sesión.
 *
 * Lo que sí hacía falta y no existía: **leer elementos REPETIDOS**. El esquema
 * de entrada de la cámara trae listas —una entrada por cada política de
 * vehículo, un elemento por cada relé— y el ayudante de etiqueta simple sólo
 * devuelve el primero. Leer sólo el primero de una lista de políticas es
 * exactamente cómo se aprueba un equipo que abre por su cuenta en la segunda
 * entrada.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Y POR QUÉ HAY UN ESCRITOR, QUE ES LO QUE DE VERDAD IMPORTA
 *
 * El `PUT` de estos esquemas **no admite campos sueltos**: exige el documento
 * entero. Escribir sólo el campo que se quiere cambiar borra todo lo demás del
 * equipo. De ahí `reemplazarEtiqueta`, que conserva el documento tal como vino
 * y sólo sustituye el valor pedido: es la mitad escritora de leer-modificar-
 * escribir, y sin ella esa disciplina depende de que nadie se despiste.
 */

/** Primer valor de una etiqueta, ignorando el espacio de nombres. */
export const etiqueta = (xml: string, nombre: string): string | null => {
  const m = new RegExp(`<(?:\\w+:)?${nombre}>([^<]*)</(?:\\w+:)?${nombre}>`, 'i').exec(xml);
  const capturado = m?.[1];
  return capturado === undefined ? null : capturado.trim();
};

/**
 * TODOS los bloques `<nombre>…</nombre>`, con su contenido interior.
 *
 * No es recursivo y no lo necesita: los esquemas de estos equipos anidan una
 * lista dentro de otra como mucho, y el elemento que se busca nunca contiene
 * otro del mismo nombre. Un analizador recursivo aquí sería complejidad sin
 * caso de uso, y §2.4 pide acotar la recursión, no buscarla.
 */
export const bloques = (xml: string, nombre: string): readonly string[] => {
  const encontrados: string[] = [];
  const expresion = new RegExp(
    `<(?:\\w+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nombre}>`,
    'gi',
  );
  for (const m of xml.matchAll(expresion)) {
    const interior = m[1];
    if (interior !== undefined) encontrados.push(interior);
  }
  return encontrados;
};

/** Entero, o `null` si no está o no lo es. Nunca `NaN`. */
export const entero = (crudo: string | null): number | null => {
  if (crudo === null || crudo.trim() === '') return null;
  const n = Number(crudo);
  return Number.isFinite(n) ? n : null;
};

/**
 * `true`/`false` del fabricante, que los escribe de las dos formas.
 *
 * Devuelve `null` cuando el campo no está: es distinto de `false` y hay sitios
 * donde importa —un `bigCarKeepOpen` ausente no es «desactivado», es «este
 * firmware no lo declara»— y confundirlos daría por comprobado algo que no se
 * miró.
 */
export const booleano = (crudo: string | null): boolean | null => {
  if (crudo === null || crudo.trim() === '') return null;
  const v = crudo.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'enable') return true;
  if (v === 'false' || v === '0' || v === 'no' || v === 'disable') return false;
  return null;
};

/**
 * Valores de un `opt="a,b,c"` de un elemento de capacidades.
 *
 * Las capacidades son lo que se consulta ANTES de escribir, y por eso esto
 * existe: escribir un valor que el equipo no soporta produce un rechazo cuyo
 * mensaje no dice cuál era el problema.
 */
export const opciones = (xml: string, nombre: string): readonly string[] => {
  const m = new RegExp(`<(?:\\w+:)?${nombre}\\b[^>]*\\bopt="([^"]*)"`, 'i').exec(xml);
  const crudo = m?.[1];
  if (crudo === undefined) return [];
  return crudo
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v !== '');
};

/**
 * Sustituye el VALOR de una etiqueta conservando todo lo demás del documento.
 *
 * Devuelve `null` si la etiqueta no está: inventarla y añadirla al final
 * produciría un documento que el equipo rechaza por orden de elementos, y el
 * error que devuelve no lo dice. Que falte es información —este firmware no
 * tiene ese campo— y quien llama tiene que poder verlo.
 */
export const reemplazarEtiqueta = (xml: string, nombre: string, valor: string): string | null => {
  const expresion = new RegExp(`(<(?:\\w+:)?${nombre}>)([^<]*)(</(?:\\w+:)?${nombre}>)`, 'i');
  if (!expresion.test(xml)) return null;
  return xml.replace(expresion, `$1${valor}$3`);
};

/** Escapa lo que vaya a viajar dentro de un elemento. */
export const escapar = (valor: string): string =>
  valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

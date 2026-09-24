/**
 * Tipo REAL de un fichero, por sus bytes de cabecera — §2.7.8.
 *
 * Vivía dentro del adaptador de evidencia de `eventos`. La ETAPA 15-D (O3)
 * lo saca a `comun/` porque aparece un segundo consumidor —la fotografía de
 * identificación del visitante, en `autorizaciones`— y §2.2 prohíbe que un
 * módulo importe ficheros internos de otro. Duplicar la función habría dejado
 * dos listas de firmas que se separan en la primera modificación; y una
 * validación por extensión, que es lo que NO protege, no se admite en ningún
 * camino de carga (§2.7.8).
 */
const FIRMAS: readonly { readonly mime: string; readonly bytes: readonly number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
];

/** Los únicos tipos de imagen que el sistema admite subir, en cualquier camino. */
export const TIPOS_DE_IMAGEN_ADMITIDOS = FIRMAS.map((f) => f.mime);

/**
 * Tipo REAL del contenido, o `null` si no es ninguno de los admitidos.
 * Exportada porque es lo que se prueba: hay que poder demostrar que una
 * extensión o un `Content-Type` mentidos no bastan.
 */
export const tipoRealDe = (contenido: Uint8Array): string | null =>
  FIRMAS.find((f) => f.bytes.every((b, i) => contenido[i] === b))?.mime ?? null;

/** Extensión canónica del tipo real, para nombrar el objeto en el bucket. */
export const extensionDe = (tipoMime: string): string => (tipoMime === 'image/png' ? 'png' : 'jpg');

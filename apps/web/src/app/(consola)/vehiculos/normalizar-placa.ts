/**
 * Vista previa de la normalización de una placa.
 *
 * **Es una PREVISUALIZACIÓN, no una validación.** La autoridad sigue siendo el
 * objeto de valor `Placa` del dominio, en el servidor. Esto existe porque el
 * usuario escribe `abc-123` y el sistema guarda `ABC123`: enseñarle en qué se
 * va a convertir antes de enviar evita la sorpresa de ver otra cosa en la
 * tabla, y sobre todo evita que crea que el sistema «le cambió» la placa.
 *
 * Replica exactamente los tres pasos del VO —NFKC, mayúsculas y eliminación de
 * los separadores habituales— y **no filtra nada más**: si queda un carácter
 * raro, aquí se ve tal cual y el backend lo rechaza. Limpiarlo aquí convertiría
 * `ABC-12Ω3` en una placa válida distinta, que es justo lo que el dominio
 * evita a propósito.
 */
export const vistaPreviaDePlaca = (entrada: string): string =>
  entrada
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s.\-_]/g, '');

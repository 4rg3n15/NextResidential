/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NEUTRALIZACIÓN DE FÓRMULAS EN CSV · un solo sitio · H-13-15
 *
 * Un campo que empieza por `=`, `+`, `-` o `@` lo interpreta Excel como
 * FÓRMULA al abrir el fichero. El entrecomillado de RFC 4180 no protege de
 * esto: Excel lo deshace al abrir y evalúa lo que queda dentro. Es inyección
 * de fórmulas —CSV injection—, y los campos que exporta este sistema vienen de
 * entrada de usuario: nombres, identificadores de vivienda, motivos de
 * apertura escritos por un portero.
 *
 * Vivía resuelto en `eventos/presentacion/formatos.ts` y OLVIDADO en
 * `padron/aplicacion/exportar-padron.ts`, que hacía sólo el entrecomillado.
 * Medido de punta a punta contra la base real:
 *
 *   1) alta   -> registrada
 *   2) en la BASE     -> "=HYPERLINK(\"http://malo.example\",\"ver\")"
 *   3) linea del CSV  -> "\"=HYPERLINK(\"\"http://malo.example\"\",\"\"ver\"\")\""
 *   4) lo que Excel evalúa -> "=HYPERLINK(\"http://m"
 *
 * El mismo riesgo resuelto en un fichero y olvidado en el otro es justo la
 * divergencia que el comentario de `exportar-padron.ts` decía querer evitar.
 * Por eso la regla vive aquí y los dos exportadores la importan: la política
 * de entrecomillado puede diferir entre formatos; la de seguridad, no.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Primer carácter que convierte una celda en fórmula al abrirla en Excel. */
const PELIGROSOS = new Set(['=', '+', '-', '@', '\t', '\r']);

/**
 * Antepone un apóstrofo cuando el valor empezaría siendo fórmula. Excel lo lee
 * como «esto es texto» y no lo muestra en la celda.
 */
export const neutralizarFormula = (valor: string): string =>
  valor.length > 0 && PELIGROSOS.has(valor[0] as string) ? `'${valor}` : valor;

/** Celda de CSV siempre entrecomillada, con la fórmula ya neutralizada. */
export const escaparCsv = (valor: string): string =>
  `"${neutralizarFormula(valor).replace(/"/g, '""')}"`;

#!/usr/bin/env node
/**
 * Quita los escapes ANSI de la entrada estándar.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * D-108 · POR QUÉ ESTO ES UN FICHERO Y NO UNA LÍNEA SUELTA
 *
 * Los códigos de color de Vitest **parten `Tests` de su número**: la línea que
 * el registro muestra como «Tests  648 passed» es, en bytes,
 * `Tests \e[22m \e[1m\e[32m648 passed`. Cualquier expresión regular del tipo
 * `Tests +[0-9]` deja de casar.
 *
 * Eso ya se descubrió una vez, en `estabilidad.mjs`, y su cabecera lo cuenta:
 * «los códigos de color de Vitest partían `Tests` de su número, no casaba una
 * sola línea, y comparar dos firmas vacías daba "idéntico"». Se arregló ALLÍ.
 *
 * El paso 5 de `verificar-etapa.sh` tenía el mismo defecto intacto, y salió a
 * la luz en la primera corrida del verificador en macOS: `pnpm test` terminó en
 * 0, escribió 477 200 bytes, la suite informó 648 verdes de 658 — y el paso
 * dijo «la suite no informó ni una prueba». El recuento estaba delante.
 *
 * Es la misma lección que D-105 y D-102 en esta misma ronda: **se arregla el
 * sitio donde duele y no la clase**. Por eso esto vive en un fichero que las
 * dos superficies —shell y Node— pueden usar, en vez de en una tercera copia
 * de la expresión regular.
 *
 * Por qué `[A-Za-z]` y no solo `m`: los colores terminan en `m`, pero Vitest y
 * turbo también emiten movimientos de cursor y borrados de línea (`K`, `A`,
 * `G`), y esos también partirían una línea por la mitad.
 *
 *   alguna-orden | node scripts/lib/sin-colores.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** El patrón, en un solo sitio. Lo importan los controles que lo necesitan. */
// eslint-disable-next-line no-control-regex
export const ESCAPES_ANSI = /\u001B\[[0-9;]*[A-Za-z]/g;

/** Devuelve el texto sin escapes. Acepta cualquier cosa sin lanzar. */
export const sinColores = (texto) => String(texto ?? '').replace(ESCAPES_ANSI, '');

// Como filtro de tubería solo cuando se ejecuta directamente, para que
// importarlo desde otro control no consuma la entrada estándar.
if (process.argv[1]?.endsWith('sin-colores.mjs')) {
  const trozos = [];
  for await (const t of process.stdin) trozos.push(t);
  process.stdout.write(sinColores(Buffer.concat(trozos).toString('utf8')));
}

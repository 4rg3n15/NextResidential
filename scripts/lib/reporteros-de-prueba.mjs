import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * EL INFORME JSON DE CADA SUITE, SIEMPRE Y EN UN SOLO SITIO.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE · D-113, un escalón más abajo
 *
 * El paso de estabilidad informó «la corrida 1 terminó en rojo» y, con sus
 * propias palabras, «sin nombre de prueba en la salida: el reportero no lo
 * emitió. Es un defecto de ESTE control». Tenía razón: **raspaba la consola**, y
 * el formato de la consola depende del reportero, que a su vez depende de si
 * `CI` está puesto. Un control cuyo diagnóstico se rompe al cambiar una
 * variable de entorno no diagnostica nada.
 *
 * La salida fiable no es el texto: es el informe JSON, que tiene la misma forma
 * con cualquier reportero. Desde aquí se emite **siempre**, y quien necesite
 * saber qué prueba falló lo lee de ahí. Es lo que el paso 7 ya hacía.
 *
 * Efecto de lado que no es menor: los informes existen en TODA corrida, no sólo
 * cuando alguien invoca `metricas.mjs`. El instrumento de D-101 —la roja
 * intermitente— deja de depender de qué guion arrancó la suite.
 */

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Donde viven los informes. Está en `.gitignore`. */
export const DIRECTORIO_DE_INFORMES = join(RAIZ, '.informes-de-prueba');

/**
 * Configuración de reporteros para el `vitest.config.ts` de un paquete.
 *
 * `default` se mantiene para que la consola siga siendo legible; el JSON se
 * añade al lado. `metricas.mjs` pasa su propio `--outputFile` y lo sobrescribe,
 * que es lo correcto: manda quien invoca.
 */
export const informeDe = (paquete) => ({
  reporters: ['default', 'json'],
  outputFile: { json: join(DIRECTORIO_DE_INFORMES, `${paquete}.json`) },
});

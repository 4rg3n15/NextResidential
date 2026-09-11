#!/usr/bin/env node
/**
 * Ningún componente de la consola emite un atributo `style`.
 *
 * POR QUÉ EXISTE (D-63). Las barras del tablero, del gráfico semanal y del
 * aforo se dimensionaban con `style={{ height: `${p}%` }}`. React sirve eso
 * como atributo `style="height:37%"`, y la CSP de la consola —`style-src
 * 'self' 'nonce-…'`, sin `unsafe-inline`, §2.7.7— **hace que el navegador lo
 * rechace**: las barras salen a cero y el navegador se queja en la consola.
 *
 * No lo detectó ninguna prueba, y el motivo es exactamente el patrón DT-12:
 * las pruebas de componentes corren en **jsdom, que no aplica CSP**, y el
 * recorrido del navegador visita el tablero **sin datos**, así que no había ni
 * una barra que pintar. Dos suites que se solapan y dejan un intervalo justo
 * donde vivía el defecto.
 *
 * Un nonce no arregla esto: un nonce firma etiquetas `<style>`, no atributos.
 * La salida es `src/lib/proporcion.ts` y las clases estáticas de `globals.css`,
 * y este control es lo que impide que alguien vuelva al atajo sin enterarse.
 *
 * Va en Node por la regla de portabilidad: desarrollo en macOS, CI en Linux.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '..', '..', 'apps', 'web', 'src');

const ficheros = [];
const recorrer = (dir) => {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (['.tsx', '.ts'].includes(extname(entrada.name))) ficheros.push(ruta);
  }
};
recorrer(raiz);

/** `style={{ … }}` en JSX y `style="…"` en HTML literal. */
const PATRONES = [
  [/\bstyle=\{\{/, 'style={{ … }} en JSX: React lo sirve como atributo style="…"'],
  [/\bstyle="/, 'atributo style="…" literal'],
  [/\.setAttribute\(\s*['"]style['"]/, 'setAttribute("style", …), que la CSP trata igual'],
];

const hallazgos = [];
for (const fichero of ficheros) {
  // Las pruebas pueden construir marcado con estilos para comprobar justamente
  // este control; excluirlas evita que el control se denuncie a sí mismo.
  if (/\.test\.[cm]?tsx?$/.test(fichero)) continue;
  const lineas = readFileSync(fichero, 'utf8').split('\n');
  lineas.forEach((linea, i) => {
    // Los comentarios se saltan: este mismo control, el módulo que lo sustituye
    // y la construcción de la CSP tienen que poder NOMBRAR el atributo para
    // explicar por qué está prohibido. Un control que se denuncia a sí mismo
    // acaba desactivado, que es peor que no tenerlo.
    const sinComentario = linea.replace(/\/\/.*$/, '').trim();
    if (sinComentario === '' || sinComentario.startsWith('*') || sinComentario.startsWith('/*')) {
      return;
    }
    for (const [patron, motivo] of PATRONES) {
      if (patron.test(sinComentario)) {
        hallazgos.push(`${fichero.replace(raiz, 'apps/web/src')}:${i + 1} — ${motivo}`);
      }
    }
  });
}

if (hallazgos.length > 0) {
  console.error(
    'Atributos `style` en la consola: la CSP los rechaza y el elemento se queda sin estilo.',
  );
  console.error('Use `claseDeAlto` / `claseDeAncho` de src/lib/proporcion.ts.\n');
  for (const h of hallazgos) console.error(`  · ${h}`);
  process.exit(1);
}

console.log(`OK ningún atributo \`style\` en la consola (${ficheros.length} ficheros, §2.7.7)`);

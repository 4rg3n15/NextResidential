#!/usr/bin/env node
/**
 * Ningún color de la consola se escapa del sistema de temas.
 *
 * POR QUÉ EXISTE. El modo oscuro se rompe siempre por el mismo sitio: un color
 * literal que alguien dejó suelto. `bg-white` junto a `text-texto` se ve
 * perfecto en claro —el fondo de tarjeta ES blanco— y en oscuro produce
 * exactamente el fallo conocido: etiqueta clara sobre fondo blanco. Al montar
 * el tema oscuro había **catorce** de esos en los formularios de la consola,
 * más el botón secundario, y ninguna prueba los veía porque en claro no fallan.
 *
 * La regla que este control impone es: **todo color viene de un token del
 * preset**, y cada token vive en una pareja fondo/texto medida en los dos temas
 * (`packages/config/src/temas.ts`). Un literal no tiene pareja, así que no se
 * puede medir, así que no se admite.
 *
 * También rechaza el variante `dark:` de Tailwind. No es que esté mal en
 * general: es que aquí el tema lo resuelven las variables CSS, y un `dark:`
 * suelto significa que alguien decidió el color de una pantalla por su cuenta,
 * fuera de las parejas. Basta olvidarlo en una de las dieciocho vistas.
 *
 * Va en Node por la regla de portabilidad: desarrollo en macOS, CI en Linux.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const raizRepo = resolve(import.meta.dirname, '..', '..');
const raiz = resolve(raizRepo, 'apps', 'web', 'src');

const ficheros = [];
const recorrer = (dir) => {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) recorrer(ruta);
    else if (['.tsx', '.ts'].includes(extname(entrada.name))) ficheros.push(ruta);
  }
};
recorrer(raiz);

/** Familias de color de Tailwind que el preset NO declara: si aparecen, son literales. */
const FAMILIAS_AJENAS =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PREFIJOS =
  'bg|text|border|ring|ring-offset|divide|placeholder|decoration|outline|fill|stroke|from|via|to|accent|caret|shadow';

const PATRONES = [
  [
    new RegExp(`\\b(?:${PREFIJOS})-(?:${FAMILIAS_AJENAS})-\\d{2,3}\\b`),
    'color de la paleta por defecto de Tailwind: no tiene pareja declarada ni valor en tema oscuro',
  ],
  [
    /\bdark:[a-z-]/,
    'variante `dark:`: el tema lo resuelven las variables del preset, no una clase suelta por pantalla',
  ],
  [
    /\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/,
    'color hexadecimal literal en una clase: fuera del sistema de temas',
  ],
  [/\bbg-black\b|\btext-black\b/, 'negro literal: usa `bg-oscuro-*` o `text-texto`'],
];

/**
 * `bg-white` y `text-white` son legítimos en dos sitios, y sólo en dos.
 *
 * · `text-white` sobre un RELLENO saturado —los cuatro botones sólidos y la
 *   pastilla del logotipo—: ese par no depende del fondo de la página, vale lo
 *   mismo en los dos temas y está declarado y medido en `PAREJAS`.
 * · `bg-white` en la zona de silencio del código QR del segundo factor: es un
 *   requisito del formato, no una decisión de tema. Muchos lectores fallan
 *   sobre fondo oscuro.
 */
const RELLENOS_CON_ETIQUETA_BLANCA =
  /\bbg-(?:marca|marca-boton|marca-presionado|peligro-boton|exito-boton|exito-presionado)\b/;
const EXCEPCION_QR = 'acceso/inscripcion-factor.tsx';

const hallazgos = [];

for (const fichero of ficheros) {
  const relativo = relative(raizRepo, fichero);
  const lineas = readFileSync(fichero, 'utf8').split('\n');

  lineas.forEach((cruda, indice) => {
    const numero = indice + 1;
    /**
     * Se mira el CÓDIGO, no los comentarios. Este mismo control y los avisos
     * que dejaron los arreglos nombran `bg-white` por escrito para explicar por
     * qué ya no se usa; un control que se dispara con su propia documentación
     * enseña a silenciarlo, que es peor que no tenerlo.
     */
    const sinBloque = cruda.replace(/\/\*.*?\*\//g, ' ');
    const linea = /^\s*(\/\/|\*|\/\*)/.test(cruda) ? '' : sinBloque.replace(/\/\/.*$/, '');

    for (const [patron, motivo] of PATRONES) {
      if (patron.test(linea)) hallazgos.push(`${relativo}:${numero} · ${motivo}`);
    }

    if (/\btext-white\b/.test(linea) && !RELLENOS_CON_ETIQUETA_BLANCA.test(linea)) {
      hallazgos.push(
        `${relativo}:${numero} · \`text-white\` sin un relleno saturado que lo sostenga: sobre una superficie de tema queda ilegible en claro`,
      );
    }

    if (/\bbg-white\b/.test(linea) && !relativo.endsWith(EXCEPCION_QR)) {
      hallazgos.push(
        `${relativo}:${numero} · \`bg-white\` literal: usa \`bg-tarjeta\` o \`bg-campo\`, que sí cambian con el tema`,
      );
    }
  });
}

if (hallazgos.length > 0) {
  console.error('colores fuera del sistema de temas:');
  for (const h of hallazgos) console.error(`  ${h}`);
  process.exit(1);
}

console.log(
  `OK ${String(ficheros.length)} ficheros de la consola: todo color sale de un token con pareja medida en los dos temas`,
);

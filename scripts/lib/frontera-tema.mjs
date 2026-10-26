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
import { extname, join, relative, resolve, sep } from 'node:path';

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
/**
 * D-69 · la salvedad se compara con BARRAS NORMALES.
 *
 * `relative()` devuelve `apps\web\src\app\acceso\inscripcion-factor.tsx` en
 * Windows, y `endsWith('acceso/inscripcion-factor.tsx')` era falso: la
 * salvedad dejaba de aplicar y el control denunciaba el `bg-white` del código
 * QR —documentado, legítimo y con su comentario al lado— como si fuera un
 * literal suelto. Un control que cambia de veredicto según el sistema donde
 * corre no verifica nada: afirma.
 */
const conBarrasNormales = (ruta) => ruta.split(sep).join('/');

/**
 * D-141 · una clase de color que nombra un token INEXISTENTE.
 *
 * Los avisos emergentes de visita y de atención en vivo salían con fondo
 * transparente y el texto montado sobre la pantalla: usaban `bg-superficie`, y
 * el preset no tiene ningún `superficie`. Tailwind no se queja de una clase
 * que no conoce —simplemente no emite nada—, así que compila, pasa las
 * pruebas y no pinta. Los patrones de arriba buscan colores que SOBRAN; este
 * busca los que FALTAN, que es el fallo contrario y nadie lo veía.
 *
 * Los tokens se leen del FUENTE del preset (`temas.ts` y la escala de
 * `tailwind-preset.ts`), no de su `dist/`: un artefacto puede envejecer y el
 * fuente no (§2.8.0). Se recorre `TEMA_CLARO` porque `coloresDelPreset()`
 * deriva las clases de él; `DEFAULT` no forma parte del nombre.
 */
const fuente = (ruta) => readFileSync(resolve(raizRepo, ruta), 'utf8');
const desde = (texto, marca) => texto.slice(texto.indexOf(marca) + marca.length);

const tokensDeColor = new Set();
{
  const pila = [];
  const paleta = desde(fuente('packages/config/src/temas.ts'), 'TEMA_CLARO: PaletaDeTema = {');
  for (const m of paleta.matchAll(/(\w+):\s*\{|(\w+):\s*'|\}/g)) {
    if (m[1] !== undefined) pila.push(m[1]);
    else if (m[2] !== undefined)
      tokensDeColor.add([...pila, m[2]].filter((p) => p !== 'DEFAULT').join('-'));
    else if (pila.pop() === undefined) break;
  }
}
/** La escala tipográfica comparte prefijo con el color: `text-cuerpo` es un tamaño. */
const tamanosDeTexto = new Set(
  [
    ...desde(fuente('packages/config/src/tailwind-preset.ts'), 'export const tipografia = {')
      .split('\n} as const;')[0]
      .matchAll(/^\s+(\w+): \[/gm),
  ].map((m) => m[1]),
);
/**
 * Sufijos de esos prefijos que no son color: grosores, lados, alineación, tamaños de Tailwind.
 * La coma y el corchete quedan fuera del arranque: `transition-[color,border-color]` nombra
 * propiedades CSS, no clases.
 */
const SIN_COLOR =
  /^(?:\d+|[xytrblse](?:-\d+)?|xs|sm|base|lg|\d?xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|solid|dashed|dotted|double|hidden|none|collapse|separate|inset|foco|transparent|current|inherit|white|black)$/;
const CLASE_DE_COLOR =
  /(?<![\w,[-])(?:[\w-]+:)*(bg|text|border|ring-offset|ring)-([\w-]+)(?:\/[\w.]+)?(?![\w-])/g;
const colorDeclarado = (prefijo, nombre) =>
  tokensDeColor.has(nombre) ||
  SIN_COLOR.test(nombre) ||
  (prefijo === 'text' && tamanosDeTexto.has(nombre));

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

    for (const [clase, prefijo, nombre] of linea.matchAll(CLASE_DE_COLOR)) {
      if (!colorDeclarado(prefijo, nombre)) {
        hallazgos.push(
          `${relativo}:${numero} · \`${clase}\` nombra un token que el preset no declara: Tailwind no emite nada y el elemento queda sin ese estilo`,
        );
      }
    }

    if (/\btext-white\b/.test(linea) && !RELLENOS_CON_ETIQUETA_BLANCA.test(linea)) {
      hallazgos.push(
        `${relativo}:${numero} · \`text-white\` sin un relleno saturado que lo sostenga: sobre una superficie de tema queda ilegible en claro`,
      );
    }

    if (/\bbg-white\b/.test(linea) && !conBarrasNormales(relativo).endsWith(EXCEPCION_QR)) {
      hallazgos.push(
        `${relativo}:${numero} · \`bg-white\` literal: usa \`bg-tarjeta\` o \`bg-campo\`, que sí cambian con el tema`,
      );
    }
  });
}

if (hallazgos.length > 0) {
  console.error('colores fuera del sistema de temas:');
  for (const h of hallazgos) console.error(`  ${h}`);
  // 15-S5 · DT-15S2-11 · exitCode y no exit: la salida llega entera al lector (patrón de metricas.mjs).
  process.exitCode = 1;
} else {
  console.log(
    `OK ${String(ficheros.length)} ficheros de la consola: todo color sale de un token con pareja medida en los dos temas`,
  );
}

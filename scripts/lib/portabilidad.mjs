#!/usr/bin/env node
/**
 * Verificador de portabilidad de los guiones del repositorio.
 *
 * POR QUÉ EXISTE. El entorno de desarrollo objetivo es **macOS** (BSD) y el CI
 * de la ETAPA 14 correrá en **Linux** (GNU). Tres veces seguidas una diferencia
 * entre ambos cambió el resultado —y la tercera fue el propio control contra
 * falsos verdes, que en macOS informaba «0 de 14»—. Arreglarlas una a una según
 * fallan no cierra la clase: este guion la cierra revisando **todos** los `.sh`
 * versionados contra la lista de construcciones cuyo comportamiento diverge.
 *
 * Regla derivada: si algo necesita aritmética, recorrer directorios o expresiones
 * regulares no triviales, va en Node, que se comporta igual en las dos
 * plataformas y está garantizado en este monorepo.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** [patrón, qué diverge, alternativa portable] */
const DIVERGENTES = [
  [
    /\bxargs\s+(-\w*\s+)*-r\b|\bxargs\s+-r\b/,
    '`xargs -r` es extensión de GNU; BSD no la reconoce',
    'comprobar que la entrada no está vacía antes de invocar xargs, o hacerlo en Node',
  ],
  [/\bpaste\s+-\w*s\w*d/, '`paste -sd` condensado falla en BSD', 'sumar o unir en Node'],
  [/\bbc\b/, '`bc` no está garantizado en macOS moderno', 'aritmética en bash `$(( ))` o en Node'],
  // Lo portable es EXACTAMENTE `sed -i ''` (sufijo vacío explícito). Cualquier
  // otra cosa —incluido `sed -i 's/a/b/'`, que es la forma GNU— diverge.
  [
    /\bsed\s+-i(?!\s*(''|""))/,
    "`sed -i` sin sufijo vacío: GNU lo acepta, BSD exige `-i ''`",
    'escribir a un temporal y mover, o hacerlo en Node',
  ],
  [
    /\bgrep\s+(-\w*\s+)*-\w*P/,
    '`grep -P` (PCRE) no existe en BSD grep',
    '`grep -E`, o expresión regular en Node',
  ],
  [
    /\breadlink\s+-f\b/,
    '`readlink -f` no existe en macOS anterior a Monterey',
    '`cd "$(dirname "$0")" && pwd`',
  ],
  [/\bstat\s+-c\b/, '`stat -c` es GNU; BSD usa `-f` con otro formato', 'obtener metadatos en Node'],
  [/\bdate\s+-d\b/, '`date -d` es GNU; BSD usa `-v` / `-j -f`', 'calcular fechas en Node'],
  [
    /\bfind\b[^\n|]*-printf/,
    '`find -printf` es GNU',
    '`find … -print0` con xargs -0, o recorrer en Node',
  ],
  [
    /\b(md5sum|sha256sum|nproc|tac|realpath)\b/,
    'utilidad exclusiva de GNU coreutils',
    'equivalente BSD, o Node',
  ],
  [/\bsort\s+(-\w*\s+)*-\w*V/, '`sort -V` no está en BSD sort', 'ordenar en Node'],
  [
    /\bhead\s+--|\btail\s+--/,
    'opciones largas de head/tail son GNU',
    'formas cortas: `head -n`, `tail -n',
  ],
  // bash 3.2 es el que trae macOS de fábrica.
  [
    /\bdeclare\s+-A\b/,
    'arreglos asociativos exigen bash 4; macOS trae 3.2',
    'arreglos indexados, o Node',
  ],
  [/\b(mapfile|readarray)\b/, '`mapfile`/`readarray` exigen bash 4', '`while read -r`'],
  [
    /\$\{[A-Za-z_][A-Za-z0-9_]*(,,|\^\^)/,
    'conversión de mayúsculas `${x,,}` exige bash 4',
    '`tr` o Node',
  ],
];

/**
 * Un `.sh` no es la única superficie donde vive shell. Auditar solo esos dejaba
 * fuera cuatro sitios donde una construcción divergente rompe igual — y donde
 * además es más fácil que pase inadvertida, porque nadie los lee como código:
 *
 *   · los `scripts` de cada `package.json`, que ejecuta el intérprete del sistema
 *   · los ganchos de `.husky/`, que no llevan extensión
 *   · los bloques `run:` de los flujos de GitHub Actions
 *   · el `Makefile`, si aparece
 */
const versionados = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((f) => f.length > 0);

/** Devuelve [{ archivo, linea, texto }] con el shell embebido de cada superficie. */
const extraerShell = (archivo) => {
  const contenido = readFileSync(archivo, 'utf8');
  const filas = [];

  if (archivo.endsWith('.sh') || archivo.startsWith('.husky/')) {
    contenido.split('\n').forEach((texto, i) => filas.push({ linea: i + 1, texto }));
    return filas;
  }

  if (archivo.endsWith('package.json')) {
    // Se recorre el texto para conservar el número de línea real: un hallazgo
    // sin línea obliga a buscarlo a mano, y eso hace que no se arregle.
    let dentro = false;
    contenido.split('\n').forEach((texto, i) => {
      if (/^\s*"scripts"\s*:\s*\{/.test(texto)) {
        dentro = true;
        return;
      }
      if (dentro && /^\s*\}/.test(texto)) {
        dentro = false;
        return;
      }
      if (dentro) {
        const m = texto.match(/^\s*"[^"]+"\s*:\s*"(.*)"\s*,?\s*$/);
        if (m) filas.push({ linea: i + 1, texto: m[1].replace(/\\"/g, '"') });
      }
    });
    return filas;
  }

  if (/^\.github\/workflows\/.*\.ya?ml$/.test(archivo)) {
    // `run:` de una línea y `run: |` con bloque indentado.
    const lineas = contenido.split('\n');
    let sangriaBloque = null;
    lineas.forEach((texto, i) => {
      if (sangriaBloque !== null) {
        const sangria = texto.match(/^(\s*)/)[1].length;
        if (texto.trim() === '' || sangria >= sangriaBloque) {
          filas.push({ linea: i + 1, texto });
          return;
        }
        sangriaBloque = null;
      }
      const bloque = texto.match(/^(\s*)-?\s*run:\s*[|>][-+]?\s*$/);
      if (bloque) {
        sangriaBloque = bloque[1].length + 1;
        return;
      }
      const enLinea = texto.match(/^\s*-?\s*run:\s*(.+)$/);
      if (enLinea) filas.push({ linea: i + 1, texto: enLinea[1] });
    });
    return filas;
  }

  if (/(^|\/)Makefile$/.test(archivo)) {
    contenido.split('\n').forEach((texto, i) => {
      if (/^\t/.test(texto)) filas.push({ linea: i + 1, texto });
    });
    return filas;
  }

  return filas;
};

const SUPERFICIES = (f) =>
  f.endsWith('.sh') ||
  f.startsWith('.husky/') ||
  f.endsWith('package.json') ||
  /^\.github\/workflows\/.*\.ya?ml$/.test(f) ||
  /(^|\/)Makefile$/.test(f);

const auditados = versionados
  .filter(SUPERFICIES)
  .filter((f) => f !== 'scripts/lib/portabilidad.mjs');

const hallazgos = [];
for (const archivo of auditados) {
  for (const { linea, texto } of extraerShell(archivo)) {
    // Los comentarios describen estas construcciones a propósito (los
    // encabezados que explican por qué se evitaron).
    if (/^\s*#/.test(texto)) continue;
    for (const [patron, problema, alternativa] of DIVERGENTES) {
      if (patron.test(texto)) {
        hallazgos.push({ archivo, linea, texto: texto.trim(), problema, alternativa });
      }
    }
  }
}

if (hallazgos.length > 0) {
  console.error(
    `PORTABILIDAD: ${hallazgos.length} construcción(es) que divergen entre BSD y GNU\n`,
  );
  for (const h of hallazgos) {
    console.error(`  ${h.archivo}:${h.linea}`);
    console.error(`    ${h.texto}`);
    console.error(`    ✗ ${h.problema}`);
    console.error(`    → ${h.alternativa}\n`);
  }
  process.exit(1);
}
console.log(
  `portabilidad: ${auditados.length} superficies con shell sin construcciones divergentes BSD/GNU ` +
    `(.sh, scripts de package.json, .husky/, run: de workflows, Makefile)`,
);

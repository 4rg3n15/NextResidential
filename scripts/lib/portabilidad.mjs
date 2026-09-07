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

const guiones = execFileSync('git', ['ls-files', '-z', '*.sh'], { encoding: 'utf8' })
  .split('\0')
  .filter((f) => f.length > 0);

const hallazgos = [];
for (const archivo of guiones) {
  const lineas = readFileSync(archivo, 'utf8').split('\n');
  lineas.forEach((linea, i) => {
    // Los comentarios describen estas construcciones a propósito (este mismo
    // fichero, y los encabezados que explican por qué se evitaron).
    if (/^\s*#/.test(linea)) return;
    for (const [patron, problema, alternativa] of DIVERGENTES) {
      if (patron.test(linea)) {
        hallazgos.push({ archivo, linea: i + 1, texto: linea.trim(), problema, alternativa });
      }
    }
  });
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
console.log(`portabilidad: ${guiones.length} guiones sin construcciones divergentes BSD/GNU`);

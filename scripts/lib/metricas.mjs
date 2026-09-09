#!/usr/bin/env node
/**
 * Métricas del cierre de etapa, calculadas SIN shell.
 *
 * La cifra «8 de 14» del cierre anterior salió de un error de conteo en shell:
 * `grep -oE "Test Files +[0-9]+ (passed|failed)"` capturaba solo el primer
 * número de «1 failed | 4 passed (5)». Ese mismo shell midió el resto del
 * cierre, así que las cifras se recalculan aquí, con el JSON del ejecutor y no
 * con texto raspado de la consola.
 *
 * Uso: node scripts/lib/metricas.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdtempSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const raiz = process.cwd();
const IGNORADOS = new Set(['node_modules', 'dist', 'coverage', '.turbo', '.git']);

const buscar = (dir, prueba, acc = []) => {
  let e;
  try {
    e = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const d of e) {
    if (IGNORADOS.has(d.name)) continue;
    const r = join(dir, d.name);
    if (d.isDirectory()) buscar(r, prueba, acc);
    else if (prueba(r)) acc.push(relative(raiz, r));
  }
  return acc;
};

const ficheros = ['apps', 'packages']
  .flatMap((d) => buscar(join(raiz, d), (f) => /\.(test|spec)\.tsx?$/.test(f)))
  .sort();

console.log(`## Ficheros de prueba en disco: ${ficheros.length}\n`);
for (const f of ficheros) console.log(`  ${f}`);

/** Ejecuta vitest en un paquete y devuelve su informe JSON. */
const correr = (paquete, dir) => {
  const salida = join(mkdtempSync(join(tmpdir(), 'ncr-')), 'r.json');
  try {
    execFileSync(
      'pnpm',
      [
        '--filter',
        paquete,
        'exec',
        'vitest',
        'run',
        '--reporter=json',
        `--outputFile=${salida}`,
        '--coverage',
        '--coverage.reporter=json-summary',
        '--coverage.reporter=text',
      ],
      { cwd: raiz, stdio: 'pipe', encoding: 'utf8' },
    );
  } catch {
    /* el informe se escribe igual aunque haya rojos */
  }
  const informe = existsSync(salida) ? JSON.parse(readFileSync(salida, 'utf8')) : null;
  const resumenPath = join(raiz, dir, 'coverage', 'coverage-summary.json');
  const cobertura = existsSync(resumenPath) ? JSON.parse(readFileSync(resumenPath, 'utf8')) : null;
  return { informe, cobertura };
};

const paquetes = [
  ['@ncr/domain-core', 'packages/domain-core'],
  ['@ncr/api', 'apps/api'],
  // `@ncr/providers` entra desde la ETAPA 05: antes no tenía pruebas, y su
  // ausencia aquí habría dejado 23 ficheros medidos de 24 en disco — el hueco
  // exacto que el paso 6 existe para detectar.
  ['@ncr/providers', 'packages/providers'],
  // ETAPA 09 · el preset compartido y la consola. `@ncr/config` trae la
  // verificación de contraste de AA, que es una comprobación de producto y no
  // un detalle de estilo; `@ncr/web`, la lógica del canal, la CSP y los
  // estados. Dejarlos fuera habría reproducido el hueco de `@ncr/providers`:
  // ficheros de prueba en disco que nadie mide.
  ['@ncr/config', 'packages/config'],
  ['@ncr/web', 'apps/web'],
];

let totalPruebas = 0;
let totalFicheros = 0;
const coberturaPorCapa = { dominio: [], aplicacion: [], resto: [] };
/**
 * Paquetes cuya cobertura NO se pudo leer.
 *
 * Hallazgo del 2026-09-08: si la corrida de un paquete falla, este guion
 * imprimía «(sin resumen de cobertura)» y **seguía**. El resultado fue un paso 7
 * que informaba «las tres capas cumplen su umbral» midiendo 21 archivos en vez
 * de 83, con la capa de aplicación desaparecida por completo — el mismo agujero
 * que el paso existe para cerrar, esta vez un escalón más arriba: no era una
 * capa por debajo del umbral, era una capa que nadie midió. Ahora es fallo.
 */
const sinMedir = [];

for (const [paquete, dir] of paquetes) {
  const { informe, cobertura } = correr(paquete, dir);
  if (!informe) {
    console.log(`\n## ${paquete}: SIN INFORME — la corrida no produjo resultados`);
    sinMedir.push(`${paquete} (sin informe de pruebas)`);
    continue;
  }
  const suites = informe.testResults ?? [];
  const pruebas = informe.numTotalTests ?? 0;
  totalPruebas += pruebas;
  totalFicheros += suites.length;
  console.log(`\n## ${paquete}`);
  console.log(
    `   ficheros ejecutados: ${suites.length} · pruebas: ${pruebas} ` +
      `(${informe.numPassedTests ?? 0} verdes, ${informe.numFailedTests ?? 0} rojas)`,
  );
  for (const s of suites) {
    const n = (s.assertionResults ?? []).length;
    console.log(
      `     ${String(n).padStart(3)}  ${relative(raiz, s.name ?? s.testFilePath ?? '?')}`,
    );
  }

  if (!cobertura) {
    console.log('   SIN RESUMEN DE COBERTURA — este paquete no entra en la medición');
    sinMedir.push(`${paquete} (sin resumen de cobertura)`);
    continue;
  }
  for (const [archivo, m] of Object.entries(cobertura)) {
    if (archivo === 'total') continue;
    const rel = relative(raiz, archivo);
    const capa = /packages\/domain-core\/src\//.test(rel)
      ? 'dominio'
      : /\/aplicacion\//.test(rel)
        ? 'aplicacion'
        : 'resto';
    coberturaPorCapa[capa].push([rel, m]);
  }
}

const agregar = (filas) => {
  const t = { lines: [0, 0], branches: [0, 0], functions: [0, 0], statements: [0, 0] };
  for (const [, m] of filas) {
    for (const k of Object.keys(t)) {
      t[k][0] += m[k].covered;
      t[k][1] += m[k].total;
    }
  }
  const pct = ([c, n]) => (n === 0 ? 100 : (c / n) * 100);
  return {
    lines: pct(t.lines),
    branches: pct(t.branches),
    functions: pct(t.functions),
    statements: pct(t.statements),
  };
};

console.log(`\n## Cobertura por capa (§2.4: 90 % en dominio y aplicación, 70 % global)\n`);
const filaGlobal = [
  ...coberturaPorCapa.dominio,
  ...coberturaPorCapa.aplicacion,
  ...coberturaPorCapa.resto,
];
const objetivos = [
  ['dominio (packages/domain-core/src)', coberturaPorCapa.dominio, 90],
  ['aplicacion (**/aplicacion/**)', coberturaPorCapa.aplicacion, 90],
  ['global', filaGlobal, 70],
];
let incumple = 0;
for (const [nombre, filas, umbral] of objetivos) {
  if (filas.length === 0) {
    // Una capa sin archivos medidos NO es una capa que cumple: es una capa que
    // nadie miró. Se cuenta como incumplimiento.
    console.log(`  FALTA ${nombre}: SIN ARCHIVOS MEDIDOS`);
    incumple += 1;
    continue;
  }
  const a = agregar(filas);
  const ok = a.lines >= umbral;
  if (!ok) incumple += 1;
  console.log(
    `  ${ok ? 'OK  ' : 'BAJO'} ${nombre}: lineas ${a.lines.toFixed(2)} % · ramas ${a.branches.toFixed(2)} % ` +
      `· funciones ${a.functions.toFixed(2)} % (umbral ${umbral} %, ${filas.length} archivos)`,
  );
}

console.log(
  `\n## Totales\n   ficheros ejecutados: ${totalFicheros} de ${ficheros.length} en disco · pruebas: ${totalPruebas}`,
);
if (sinMedir.length > 0) {
  console.log(`\n   ${sinMedir.length} paquete(s) QUEDARON FUERA de la medición:`);
  for (const p of sinMedir) console.log(`     - ${p}`);
  console.log('   Una capa sin medir no es una capa que cumple.');
  process.exit(1);
}
if (incumple > 0) {
  console.log(`\n   ${incumple} capa(s) por debajo del umbral de §2.4 o sin medir`);
  process.exit(1);
}

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
  .flatMap((d) => buscar(join(raiz, d), (f) => /\.(test|spec)\.ts$/.test(f)))
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
];

let totalPruebas = 0;
let totalFicheros = 0;
const coberturaPorCapa = { dominio: [], aplicacion: [], resto: [] };

for (const [paquete, dir] of paquetes) {
  const { informe, cobertura } = correr(paquete, dir);
  if (!informe) {
    console.log(`\n## ${paquete}: sin informe`);
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
    console.log('   (sin resumen de cobertura)');
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
    console.log(`  ${nombre}: sin archivos medidos`);
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
if (incumple > 0) {
  console.log(`\n   ${incumple} capa(s) por debajo del umbral de §2.4`);
  process.exit(1);
}

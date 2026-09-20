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
  let fallo = null;
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
    fallo = null;
  } catch (e) {
    /**
     * El informe se escribe igual aunque haya rojos, así que una excepción aquí
     * NO es «la suite falló»: es que el proceso no llegó a terminar —lo mató una
     * señal, se pasó de `maxBuffer`, no encontró el binario—. Callarlo era el
     * defecto: el paquete desaparecía de la medición y el paso 7 informaba
     * «alguna capa por debajo del umbral», mandando a buscar una cobertura baja
     * que no existía. Ahora se guarda y se imprime.
     */
    /**
     * Y se guarda LA EVIDENCIA, no solo el tamaño.
     *
     * La primera versión contaba los bytes de cada flujo. Sirvió para descartar
     * que el proceso muriera por `maxBuffer` —434 KB de salida no es un
     * truncamiento— y no sirvió para nada más: el nombre de la prueba que falló
     * estaba en esos 434 KB y no se imprimía ninguno. Aquí se quedan las líneas
     * que lo dicen.
     */
    /**
     * Y la evidencia se LIMPIA antes de decidir si la hay.
     *
     * La versión anterior filtraba las líneas con `FAIL`, `✗` o `AssertionError`
     * y las imprimía tal cual. Cuando el proceso muere a mitad de escribir, lo
     * que queda en los flujos son secuencias de color sin texto: el filtro las
     * daba por buenas —el `✗` estaba, rodeado de escapes— y el informe imprimía
     * una línea EN BLANCO. Ocurrió, y el mensaje acababa en «153 por error» sin
     * decir nada más, que es peor que no haberlo intentado: parece que la
     * herramienta se quedó a medias y no se sabe por qué.
     *
     * Ahora se quitan los escapes ANSI primero y se descartan las líneas que
     * quedan vacías. Si después de eso no queda ninguna, **eso es en sí el
     * diagnóstico**: una corrida que falla por una prueba deja su nombre
     * escrito; una que no deja ninguno no falló, la mataron.
     */
    // eslint-disable-next-line no-control-regex
    const sinColores = (t) => String(t ?? '').replace(/\u001B\[[0-9;]*[A-Za-z]/g, '');
    const salida = sinColores(e.stdout);
    const errorTexto = sinColores(e.stderr);
    const pistas = salida
      .split('\n')
      .filter((l) => /FAIL|AssertionError|✗|Tests\s+\d+ failed|Unhandled/.test(l))
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 6);
    const colaDeError = errorTexto
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(-3);
    fallo =
      `${e.code ?? ''} ${e.signal ? `señal ${e.signal}` : ''} ${String(e.message).split('\n')[0]}`.trim() +
      ` · ${salida.length} bytes por salida estándar, ${errorTexto.length} por error` +
      (pistas.length === 0
        ? '\n     NINGUNA línea de fallo en la salida: esto no es una prueba en rojo.' +
          '\n     Una corrida que falla deja el nombre de la prueba escrito. Sin él, el' +
          '\n     proceso se interrumpió — señal, memoria o el contenedor— y hay que' +
          '\n     repetirlo, no buscar una cobertura baja que no existe.'
        : `\n     ${pistas.join('\n     ')}`) +
      (colaDeError.length === 0 ? '' : `\n     error: ${colaDeError.join(' / ')}`);
  }
  const informe = existsSync(salida) ? JSON.parse(readFileSync(salida, 'utf8')) : null;
  const resumenPath = join(raiz, dir, 'coverage', 'coverage-summary.json');
  const cobertura = existsSync(resumenPath) ? JSON.parse(readFileSync(resumenPath, 'utf8')) : null;
  return { informe, cobertura, fallo };
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
  // ETAPA 12 · el Edge. Lo destapó este mismo control al informar «11 ficheros
  // de prueba en disco que NADIE ejecutó»: el paso 5 los corría —136 de 136—
  // y la MEDICIÓN de cobertura no los veía, así que su capa de aplicación,
  // que es el corazón de la etapa, no entraba en el umbral del 90 % de §2.4.
  // Es la misma forma del hueco de `@ncr/providers` en la ETAPA 05.
  ['@ncr/edge', 'apps/edge'],
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
/**
 * Paquetes cuya corrida no terminó AUNQUE dejaran resumen.
 *
 * Es la otra mitad de D-85 y la que faltaba: si el resumen existe de una
 * ejecución anterior, las capas se miden con él y el paso pasa —midiendo un
 * fichero viejo—. Eso es un falso verde de manual. Y fue peor: `@ncr/providers`
 * llevaba desde la ETAPA 10 incumpliendo su propio umbral, fallando en CADA
 * corrida, y ninguna ejecución lo dijo jamás porque el código de salida se
 * perdía en un `catch` vacío. Ahora es fallo, no aviso.
 */
const corridasIncompletas = [];
/** Rutas relativas de los ficheros que SÍ se ejecutaron, para nombrar los que no. */
const ficherosMedidos = [];

for (const [paquete, dir] of paquetes) {
  const { informe, cobertura, fallo } = correr(paquete, dir);
  if (fallo !== null) {
    console.log(`\n## ${paquete}: la corrida NO terminó — ${fallo}`);
    corridasIncompletas.push(`${paquete}: ${fallo}`);
  }
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
    const ruta = relative(raiz, s.name ?? s.testFilePath ?? '?');
    ficherosMedidos.push(ruta);
    console.log(`     ${String(n).padStart(3)}  ${ruta}`);
  }

  if (!cobertura) {
    console.log('   SIN RESUMEN DE COBERTURA — este paquete no entra en la medición');
    sinMedir.push(
      `${paquete} (sin resumen de cobertura${fallo === null ? '' : `; la corrida no terminó: ${fallo}`})`,
    );
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

/**
 * El descuadre de ficheros ahora FALLA, no solo se imprime.
 *
 * Hallazgo de la revisión del 2026-09-09, misma familia que el resto: este
 * guion tenía los dos números —los de disco y los ejecutados— y se limitaba a
 * enseñarlos. `contar-pruebas.mjs` sí falla ante el descuadre, pero no corría
 * en el CI; así que allí un fichero de prueba que nadie ejecutara habría salido
 * impreso en el informe y verde en el resultado. Quien mira un CI en verde no
 * lee las cifras.
 */
if (totalFicheros < ficheros.length) {
  const medidos = new Set(ficherosMedidos);
  console.log(
    `\n   ${ficheros.length - totalFicheros} fichero(s) de prueba en disco que NADIE ejecutó:`,
  );
  for (const f of ficheros) if (!medidos.has(f)) console.log(`     - ${f}`);
  console.log('   Un fichero que no se recoge no deja ningún rojo: por eso esto es un fallo.');
  process.exit(1);
}
if (sinMedir.length > 0) {
  console.log(`\n   ${sinMedir.length} paquete(s) QUEDARON FUERA de la medición:`);
  for (const p of sinMedir) console.log(`     - ${p}`);
  console.log('   Una capa sin medir no es una capa que cumple.');
  process.exit(1);
}
if (corridasIncompletas.length > 0) {
  console.log(`\n   ${corridasIncompletas.length} corrida(s) que NO terminaron:`);
  for (const c of corridasIncompletas) console.log(`     - ${c}`);
  console.log(
    '   Un resumen que sobrevive a una corrida fallida es de la ejecución anterior:\n' +
      '   medir con él es un falso verde. Por eso esto es fallo y no aviso.',
  );
  process.exit(1);
}
if (incumple > 0) {
  console.log(`\n   ${incumple} capa(s) por debajo del umbral de §2.4 o sin medir`);
  process.exit(1);
}

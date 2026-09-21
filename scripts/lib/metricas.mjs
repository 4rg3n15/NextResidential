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
import { sinColores } from './sin-colores.mjs';

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

// El patrón ANSI vive en un solo sitio desde D-108. Tres copias eran tres
// oportunidades de arreglar una y dejar las otras dos — y es justo lo que pasó.

/**
 * D-102 · UNA LÍNEA, Y QUE DIGA CUÁL DE LAS DOS COSAS FUE.
 *
 * El bloque «QUEDARON FUERA de la medición» interpolaba el objeto entero:
 * `${fallo}` imprimía **`[object Object]`**. Y el texto fijo que lo acompañaba
 * decía «la corrida no terminó» aunque el fallo fuera una suite en rojo — la
 * misma confusión que D-100 acababa de cerrar diez líneas más arriba,
 * sobreviviendo en el segundo mensaje.
 *
 * Es la forma exacta del defecto que este repositorio persigue: se arregló el
 * sitio donde se miró, no la clase. Aquí se corrige la clase: el resumen sale
 * SIEMPRE de `detalle`, que ya trae escrito «SUITE EN ROJO» o «CORRIDA
 * INTERRUMPIDA», y la sonda 22 exige que la cadena `[object Object]` no
 * aparezca en ninguna parte de la salida.
 */
// Sin defensas para casos que no existen: en el único sitio que lo llama,
// `fallo` no es nulo y `detalle` siempre está escrito. Un `??` de adorno es una
// rama que nadie ejecuta jamás, y el trinquete de D-81 la cuenta como tal —con
// razón: una rama que nadie ha visto correr no está demostrada.
const primeraLinea = (fallo) => String(fallo.detalle).split('\n')[0].trim();

/** Ejecuta vitest en un paquete y devuelve su informe JSON. */
const correr = (paquete, dir) => {
  const salida = join(mkdtempSync(join(tmpdir(), 'ncr-')), 'r.json');
  let codigoSalida = 0;
  let crudoSalida = '';
  let crudoError = '';
  let senal = null;
  let mensajeDelProceso = '';
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
    codigoSalida = 0;
  } catch (e) {
    codigoSalida = typeof e.status === 'number' ? e.status : 1;
    crudoSalida = String(e.stdout ?? '');
    crudoError = String(e.stderr ?? '');
    senal = e.signal ?? null;
    mensajeDelProceso = String(e.message).split('\n')[0];
  }

  const informe = existsSync(salida) ? JSON.parse(readFileSync(salida, 'utf8')) : null;
  const resumenPath = join(raiz, dir, 'coverage', 'coverage-summary.json');
  const cobertura = existsSync(resumenPath) ? JSON.parse(readFileSync(resumenPath, 'utf8')) : null;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * D-100 · DOS COSAS DISTINTAS QUE ESTE CONTROL CONFUNDÍA EN UNA
   *
   * Hasta la ETAPA 12 cualquier salida distinta de 0 se informaba igual: «la
   * corrida NO terminó», con bytes, una `pista` recortada y una invitación a
   * buscar una cobertura baja. El CI de `ubuntu-latest` tumbó la ETAPA 12 con
   * ese mensaje mientras **el informe JSON tenía delante el nombre de la prueba
   * roja** y no lo imprimía. Encontrar cuál era costó abrir el registro del
   * trabajo a mano.
   *
   * Son dos situaciones con dos remedios opuestos:
   *
   *   · **SUITE EN ROJO** — hay informe y trae `numFailedTests > 0`. Lo que
   *     hace falta es el NOMBRE de la prueba, su fichero y su aserción. No es
   *     un problema de cobertura ni de entorno: es una prueba que falla.
   *   · **CORRIDA INTERRUMPIDA** — no hay informe, o lo hay sin rojas. El
   *     proceso murió: señal, memoria, el contenedor. Ahí sí hay que repetir y
   *     mirar la máquina, y NO hay ninguna prueba a la que culpar.
   *
   * Decirlas con el mismo mensaje manda a buscar el defecto donde no está, que
   * es la misma familia que este repositorio lleva doce etapas persiguiendo —y
   * esta vez dentro de la herramienta que la persigue.
   * ══════════════════════════════════════════════════════════════════════════
   */
  const rojas = informe?.numFailedTests ?? 0;

  if (codigoSalida === 0 && rojas === 0) return { informe, cobertura, fallo: null };

  if (rojas > 0) {
    /**
     * El informe ya trae, por fichero, cada aserción con su `status` y su
     * `failureMessages`. Estaba en memoria y se descartaba.
     */
    const nombradas = [];
    for (const suite of informe?.testResults ?? []) {
      for (const a of suite.assertionResults ?? []) {
        if (a.status !== 'failed') continue;
        const fichero = relative(raiz, suite.name ?? '');
        const motivo = (a.failureMessages ?? [])
          .join('\n')
          .split('\n')
          .map((l) => sinColores(l).trim())
          .filter((l) => l.length > 0)
          .slice(0, 3);
        nombradas.push(
          `✗ ${a.fullName ?? a.title}\n         en ${fichero}` +
            (motivo.length === 0 ? '' : `\n         ${motivo.join('\n         ')}`),
        );
      }
    }
    const detalle =
      `SUITE EN ROJO · ${rojas} prueba(s) fallaron de ${informe?.numTotalTests ?? '?'}` +
      (nombradas.length === 0
        ? '\n       (el informe dice que hay rojas y no trae sus aserciones: informe truncado)'
        : `\n       ${nombradas.join('\n       ')}`);
    return { informe, cobertura, fallo: { clase: 'roja', detalle } };
  }

  /**
   * Interrumpida. Aquí sí valen las pistas de los flujos, ya sin colores y
   * **sin las líneas de pnpm**: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` casa con
   * /FAIL/ y se colaba como si fuera el nombre de una prueba. Es el eco del
   * gestor de paquetes diciendo que algo falló, no el qué.
   */
  const salidaLimpia = sinColores(crudoSalida);
  const errorLimpio = sinColores(crudoError);
  const pistas = salidaLimpia
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .filter((l) => !/^ERR_PNPM_/.test(l) && !/ELIFECYCLE/.test(l))
    .filter((l) => /FAIL|AssertionError|✗|Tests\s+\d+ failed|Unhandled/.test(l))
    .slice(0, 6);
  const colaDeError = errorLimpio
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^ERR_PNPM_/.test(l))
    .slice(-3);

  const detalle =
    `CORRIDA INTERRUMPIDA · código ${codigoSalida}` +
    (senal === null ? '' : ` · señal ${senal}`) +
    ` · ${mensajeDelProceso}` +
    `\n       ${informe === null ? 'sin informe JSON' : `informe con ${informe.numTotalTests ?? 0} pruebas y 0 rojas`}` +
    ` · ${salidaLimpia.length} bytes por salida, ${errorLimpio.length} por error` +
    (pistas.length === 0
      ? '\n       NINGUNA prueba en rojo: NO busque una cobertura baja ni una aserción.' +
        '\n       El proceso murió —señal, memoria o el contenedor—. Repítalo y mire la máquina.'
      : `\n       ${pistas.join('\n       ')}`) +
    (colaDeError.length === 0 ? '' : `\n       error: ${colaDeError.join(' / ')}`);

  return { informe, cobertura, fallo: { clase: 'interrumpida', detalle } };
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NCR_PAQUETES_METRICAS · restringir la lista, solo para probar ESTE control
 *
 * La prueba negativa de D-100 tiene que meter una prueba roja de verdad y leer
 * lo que este guion imprime. Correr los seis paquetes bajo cobertura para eso
 * añadiría minutos al banco, que corre dentro del verificador; con un paquete
 * pequeño tarda dos segundos y ejercita exactamente el mismo camino: vitest de
 * verdad, informe JSON de verdad, mensaje de verdad.
 *
 * **No es un agujero para poner verde una corrida recortada**, y no lo es por
 * dos razones que conviene dejar escritas:
 *
 *  · solo admite nombres que YA están en la lista de arriba: no sirve para
 *    añadir un paquete fantasma ni para medir otra cosa;
 *  · el paso 6 del verificador cuenta los ficheros de prueba en disco contra
 *    los ejecutados, así que una corrida recortada se delata sola —es
 *    literalmente el control que destapó que `@ncr/edge` faltaba aquí—.
 * ════════════════════════════════════════════════════════════════════════════
 */
const soloEstos = (process.env.NCR_PAQUETES_METRICAS ?? '')
  .split(',')
  .map((x) => x.trim())
  .filter((x) => x.length > 0);
const paquetesAMedir =
  soloEstos.length === 0 ? paquetes : paquetes.filter(([nombre]) => soloEstos.includes(nombre));
if (soloEstos.length > 0) {
  console.log(
    `\n## AVISO: medición restringida a ${paquetesAMedir.map(([n]) => n).join(', ')} ` +
      '(NCR_PAQUETES_METRICAS). El paso 6 delata una corrida recortada.',
  );
}

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

for (const [paquete, dir] of paquetesAMedir) {
  const { informe, cobertura, fallo } = correr(paquete, dir);
  if (fallo !== null) {
    // D-100 · el encabezado dice CUÁL de las dos cosas es, porque el remedio
    // de una no sirve para la otra.
    const titulo =
      fallo.clase === 'roja' ? `${paquete}: PRUEBAS EN ROJO` : `${paquete}: la corrida NO terminó`;
    console.log(`\n## ${titulo}\n       ${fallo.detalle}`);
    corridasIncompletas.push(`${paquete}: ${fallo.detalle}`);
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
      `${paquete} (sin resumen de cobertura${fallo === null ? '' : `; ${primeraLinea(fallo)}`})`,
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
/**
 * El recuento se acota a los paquetes MEDIDOS, no al disco entero.
 *
 * Sin esto, restringir la lista con `NCR_PAQUETES_METRICAS` haría saltar este
 * mismo control —los ficheros de los paquetes que no se pidieron aparecerían
 * como «nadie los ejecutó»—, y la prueba negativa de D-100 no podría existir.
 *
 * Lo que la restricción NO afloja: en la corrida normal `paquetesAMedir` es la
 * lista entera, así que `esperados` son todos los ficheros del disco y el
 * control sigue siendo el mismo. Y cuando se restringe, el aviso de arriba lo
 * dice en la primera línea de la salida.
 */
const directoriosMedidos = paquetesAMedir.map(([, d]) => `${d}/`);
const esperados =
  soloEstos.length === 0
    ? ficheros
    : ficheros.filter((f) => directoriosMedidos.some((d) => f.startsWith(d)));

if (totalFicheros < esperados.length) {
  const medidos = new Set(ficherosMedidos);
  console.log(
    `\n   ${esperados.length - totalFicheros} fichero(s) de prueba en disco que NADIE ejecutó:`,
  );
  for (const f of esperados) if (!medidos.has(f)) console.log(`     - ${f}`);
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
  console.log(`\n   ${corridasIncompletas.length} corrida(s) que no dieron una medición válida:`);
  for (const c of corridasIncompletas) console.log(`     - ${c}`);
  console.log(
    '\n   Un resumen que sobrevive a una corrida fallida es de la ejecución anterior:\n' +
      '   medir con él es un falso verde. Por eso esto es fallo y no aviso.\n' +
      '\n   Si arriba dice SUITE EN ROJO, el nombre de la prueba está escrito: arréglela.\n' +
      '   Si dice CORRIDA INTERRUMPIDA, no hay ninguna prueba a la que culpar —el proceso\n' +
      '   murió— y lo que hay que mirar es la máquina, no la cobertura.',
  );
  process.exit(1);
}
if (incumple > 0) {
  console.log(`\n   ${incumple} capa(s) por debajo del umbral de §2.4 o sin medir`);
  process.exit(1);
}

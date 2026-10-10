/**
 * ═════════════════════════════════════════════════════════════════════════════
 * FICHEROS DE CADA PASADA · 15-S5 · DT-15S2-10
 *
 * El paso 14 nombraba las ASERCIONES rojas. Un fichero que cae fuera de ellas
 * no salía nombrado, y hay tres formas de caer así, las tres medidas con
 * vitest 3.2.7:
 *
 *  · el `beforeAll` lanza o el fichero no carga: el informe lo trae «failed»,
 *    con el motivo en `message` y ninguna aserción en rojo (las suyas quedan
 *    «skipped» o no existen). El control decía «ninguna aserción en rojo: el
 *    código de salida viene de fuera de las pruebas».
 *  · el proceso de un fichero muere (SIGKILL, memoria): vitest entero cae con
 *    «Channel closed» y NO escribe el informe de ese paquete.
 *  · un fichero que estaba en una pasada no está en otra.
 *
 * Aquí cada pasada guarda SUS informes en `estabilidad/pasada-N/` —la
 * siguiente ya no los borra antes de comparar— y se cuentan, por pasada, los
 * ficheros recogidos, los ejecutados, los omitidos y los caídos, con el nombre
 * de los que faltan y el motivo de vitest cuando lo da.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

/** Donde quedan, pasada a pasada, los informes del paso 14. */
export const archivoDeLasPasadas = (informes) => join(informes, 'estabilidad');

/** Antes de la primera pasada: los informes de una ejecución anterior del paso, fuera. */
export const empezarArchivo = (informes) => {
  rmSync(archivoDeLasPasadas(informes), { recursive: true, force: true });
};

/** Antes de cada pasada: sólo los informes sueltos; el archivo de las anteriores se queda. */
export const limpiarSueltos = (informes) => {
  mkdirSync(informes, { recursive: true });
  for (const f of readdirSync(informes)) {
    if (f.endsWith('.json')) rmSync(join(informes, f), { force: true });
  }
};

/** Tras cada pasada: sus informes, a `pasada-N/`. Devuelve ese directorio. */
export const archivarPasada = (informes, n) => {
  const destino = join(archivoDeLasPasadas(informes), `pasada-${String(n)}`);
  mkdirSync(destino, { recursive: true });
  for (const f of readdirSync(informes)) {
    if (f.endsWith('.json')) renameSync(join(informes, f), join(destino, f));
  }
  return destino;
};

const leerInforme = (ruta) => {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Los ficheros de una pasada: `paquete › fichero` → su estado. «Ejecutado» es
 * el que corrió al menos una aserción; «omitido», el que las tiene todas
 * omitidas sin motivo (un `describe.skipIf`); «caído», el que vitest da por
 * fallido sin aserción roja que lo explique.
 */
export const ficherosDe = (directorio, raiz) => {
  const ficheros = new Map();
  const paquetes = new Set();
  for (const f of readdirSync(directorio).filter((x) => x.endsWith('.json'))) {
    const informe = leerInforme(join(directorio, f));
    if (informe === null) continue; // ilegible: lo nombra `rojasDelInforme`
    const paquete = basename(f, '.json');
    paquetes.add(paquete);
    for (const suite of informe.testResults ?? []) {
      const estados = (suite.assertionResults ?? []).map((a) => a.status);
      const corridas = estados.filter((e) => e === 'passed' || e === 'failed').length;
      const rojas = estados.filter((e) => e === 'failed').length;
      const [motivo] = String(suite.message ?? '').split('\n');
      const caido = suite.status === 'failed' && rojas === 0;
      const clase = caido ? 'caido' : corridas > 0 ? 'ejecutado' : 'omitido';
      const nombre = suite.name ? relative(raiz, suite.name) : '(fichero desconocido)';
      ficheros.set(`${paquete} › ${nombre}`, { paquete, clase, motivo });
    }
  }
  return { ficheros, paquetes };
};

/** La primera línea de error que dio la consola: el motivo, cuando vitest muere sin informe. */
const primerError = (salida) =>
  salida
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /(Error|Unhandled|ERR_)/.test(l)) ?? '(la consola no dio motivo)';

/**
 * Por pasada: recogidos, ejecutados, omitidos y caídos, y los nombres de lo que
 * falta frente a las demás. Devuelve las líneas a imprimir y cuántas pasadas fallan.
 */
export const diagnosticoDeFicheros = (pasadas) => {
  const todos = new Map();
  const todosLosPaquetes = new Set();
  for (const p of pasadas) {
    for (const [k, v] of p.ficheros) todos.set(k, v);
    for (const q of p.paquetes) todosLosPaquetes.add(q);
  }
  const lineas = [];
  let fallos = 0;
  for (const [i, p] of pasadas.entries()) {
    const n = i + 1;
    const clases = [...p.ficheros.values()].map((v) => v.clase);
    const cuenta = (c) => clases.filter((x) => x === c).length;
    lineas.push(
      `   pasada ${String(n)}: ${String(p.ficheros.size)} ficheros recogidos · ` +
        `${String(cuenta('ejecutado'))} ejecutados · ${String(cuenta('omitido'))} omitidos · ` +
        `${String(cuenta('caido'))} caídos`,
    );
    const faltas = [];
    for (const [k, v] of p.ficheros) {
      if (v.clase === 'caido') faltas.push(`caído: ${k} → ${v.motivo || '(vitest no dio motivo)'}`);
    }
    for (const q of todosLosPaquetes) {
      if (p.paquetes.has(q)) continue;
      faltas.push(
        `sin informe: ${q} — vitest murió antes de escribirlo → ${primerError(p.salida)}`,
      );
    }
    for (const [k, v] of todos) {
      if (!p.ficheros.has(k) && p.paquetes.has(v.paquete)) faltas.push(`falta: ${k}`);
    }
    for (const f of faltas.slice(0, 8)) lineas.push(`   ✗ pasada ${String(n)} · ${f}`);
    if (faltas.length > 8) lineas.push(`     … y ${String(faltas.length - 8)} más`);
    fallos += faltas.length > 0 ? 1 : 0;
  }
  return { lineas, fallos };
};

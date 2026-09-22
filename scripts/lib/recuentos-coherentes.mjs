#!/usr/bin/env node
/**
 * CONTROL · los dos recuentos de la MISMA suite tienen que coincidir.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * D-112 · DOS VEREDICTOS SOBRE LO MISMO, Y NADIE LOS COMPARABA
 *
 * El verificador ejecuta la suite DOS veces por caminos distintos:
 *
 *   · paso 5 → `turbo run test`, que construye el entorno del proceso hijo a
 *     partir de lo que `turbo.json` declara.
 *   · paso 7 → `metricas.mjs`, que invoca **vitest directamente** y hereda el
 *     entorno entero.
 *
 * La corrida del usuario con la base ya correcta dejó la grieta a la vista: el
 * paso 5 informaba «@ncr/api: 653 passed | 5 skipped» y el paso 7 ejecutaba las
 * 658 sin saltarse ninguna. Las cinco eran las de `residente-pg.test.ts`, que
 * con la base buena PASAN. Los dos pasos daban verde. Los dos mentían a medias.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ NO SE LEE LA CONSOLA DE TURBO — D-113
 *
 * La primera versión de este control raspaba las líneas `@ncr/api:test: Tests
 * 658 passed (658)`. En el CI de macOS **turbo no escribe ese prefijo**: agrupa
 * la salida por tarea y deja las líneas desnudas. El control no reconoció ni un
 * recuento y falló por su propio formato, no por el defecto que vigila.
 *
 * Es el mismo error que `metricas.mjs` existe para no repetir —«las cifras se
 * recalculan aquí, con el JSON del ejecutor y no con texto raspado de la
 * consola»— y lo cometí igual, una capa más abajo. Así que el paso 5 pide
 * también el informe JSON de vitest, cada paquete escribe el suyo en su propio
 * directorio, y aquí se leen números, no prosa.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/lib/recuentos-coherentes.mjs <raiz> <salida-paso-7>
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const INFORME = '.informe-paso5.json';
const argumentos = process.argv.slice(2);
/**
 * D-114 · `--saltadas` NOMBRA lo que no se ejecutó, y punto.
 *
 * El paso 5 detectaba «5 saltadas con --con-base» y no decía CUÁLES. Tres
 * corridas del runner se fueron en deducir si eran las que dependen de la base
 * o unas distintas que se saltan solo en macOS — cuando el nombre estaba en el
 * informe JSON que el propio paso acababa de escribir. Es D-100 otra vez, en el
 * paso de al lado: el dato está y nadie lo imprime.
 */
const soloSaltadas = argumentos[0] === '--saltadas';
const [raiz, ruta7] = soloSaltadas ? [argumentos[1], null] : argumentos;
if (!raiz || (!soloSaltadas && !ruta7)) {
  console.error('uso: recuentos-coherentes.mjs [--saltadas] <raiz> [<salida-paso-7>]');
  process.exit(2);
}

/** Los informes del paso 5, uno por paquete, junto a su `package.json`. */
const delPaso5 = () => {
  const porPaquete = new Map();
  for (const grupo of ['apps', 'packages']) {
    const base = join(raiz, grupo);
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base)) {
      const informe = join(base, dir, INFORME);
      const manifiesto = join(base, dir, 'package.json');
      if (!existsSync(informe) || !existsSync(manifiesto)) continue;
      let nombre;
      let d;
      try {
        nombre = JSON.parse(readFileSync(manifiesto, 'utf8')).name;
        d = JSON.parse(readFileSync(informe, 'utf8'));
      } catch (e) {
        console.error(`FALLO ${informe} no se pudo leer: ${e.message}`);
        process.exit(1);
      }
      // Sin `?? []`: el informe JSON de vitest trae SIEMPRE las dos listas, y un
      // valor por defecto que nunca se usa es una rama que nadie ejecuta.
      const saltadas = [];
      for (const s of d.testResults) {
        for (const a of s.assertionResults) {
          if (a.status === 'pending' || a.status === 'todo' || a.status === 'skipped') {
            saltadas.push(`${a.fullName ?? a.title} · ${s.name ?? '?'}`);
          }
        }
      }
      porPaquete.set(nombre, {
        pruebas: d.numTotalTests,
        verdes: d.numPassedTests,
        rojas: d.numFailedTests,
        saltadas: d.numPendingTests + d.numTodoTests,
        nombresSaltadas: saltadas,
      });
    }
  }
  return porPaquete;
};

/** Paso 7 · la línea que `metricas.mjs` escribe para ser leída por máquina. */
const delPaso7 = () => {
  let texto;
  try {
    texto = readFileSync(ruta7, 'utf8');
  } catch (e) {
    console.error(`FALLO no se pudo leer ${ruta7}: ${e.message}`);
    process.exit(1);
  }
  const porPaquete = new Map();
  for (const linea of texto.split('\n')) {
    const m = linea.match(
      /RECUENTO\s+(\S+)\s+ficheros=(\d+)\s+pruebas=(\d+)\s+verdes=(\d+)\s+rojas=(\d+)\s+saltadas=(\d+)/,
    );
    if (!m) continue;
    porPaquete.set(m[1], {
      pruebas: Number(m[3]),
      verdes: Number(m[4]),
      rojas: Number(m[5]),
      saltadas: Number(m[6]),
    });
  }
  return porPaquete;
};

const cinco = delPaso5();

if (soloSaltadas) {
  let total = 0;
  for (const [paquete, d] of cinco) {
    if (d.saltadas === 0) continue;
    console.log(`  ${paquete}: ${d.saltadas} saltada(s)`);
    for (const n of d.nombresSaltadas) console.log(`    ⤷ ${n}`);
    total += d.saltadas;
  }
  if (total === 0) console.log('  ninguna prueba saltada');
  process.exit(0);
}

const siete = delPaso7();

if (siete.size === 0) {
  console.error(
    'FALLO el paso 7 no dejó ninguna línea RECUENTO: sin ella no hay nada que comparar,\n' +
      '  y una comparación que no compara nada es el defecto que este control persigue.',
  );
  process.exit(1);
}
if (cinco.size === 0) {
  console.error(
    `FALLO no se encontró ningún ${INFORME}. O la suite del paso 5 no corrió, o no se le\n` +
      '  pidió el informe JSON. En ninguno de los dos casos hay verde.',
  );
  process.exit(1);
}

const CAMPOS = ['pruebas', 'verdes', 'rojas', 'saltadas'];
const divergen = [];
for (const [paquete, b] of siete) {
  const a = cinco.get(paquete);
  if (a === undefined) {
    divergen.push({ paquete, motivo: 'el paso 5 no dejó informe de este paquete', a: null, b });
    continue;
  }
  const distintos = CAMPOS.filter((c) => a[c] !== b[c]);
  if (distintos.length > 0)
    divergen.push({ paquete, motivo: `difieren: ${distintos.join(', ')}`, a, b });
}

const comoTexto = (x) => (x === null ? '(ausente)' : CAMPOS.map((c) => `${c}=${x[c]}`).join(' '));

if (divergen.length > 0) {
  console.error('FALLO los dos recuentos del mismo paquete NO coinciden:\n');
  for (const d of divergen) {
    console.error(`  ✗ ${d.paquete} — ${d.motivo}`);
    console.error(`      paso 5 (turbo)   : ${comoTexto(d.a)}`);
    console.error(`      paso 7 (directo) : ${comoTexto(d.b)}`);
    // D-100 aplicado aquí: la divergencia se NOMBRA. Sin esto habría que
    // reproducirla para saber qué prueba se quedó fuera.
    for (const n of d.a?.nombresSaltadas ?? []) console.error(`      ⤷ saltada: ${n}`);
  }
  console.error(
    '\n  Los dos pasos ejecutan la MISMA suite por caminos distintos. Si discrepan,\n' +
      '  uno de los dos NO está ejecutando lo que cree, y las dos posibilidades son\n' +
      '  un falso verde. La causa de D-112 fue que `turbo.json` no declaraba las\n' +
      '  variables de entorno de las que dependen las pruebas: turbo las filtraba y\n' +
      '  vitest saltaba en silencio las que necesitan base de datos. Compruebe `env`\n' +
      '  en las tareas `test` y `test:cobertura` de turbo.json.',
  );
  process.exit(1);
}

console.log(
  `recuentos: ${siete.size} paquete(s) con el mismo resultado por los dos caminos ` +
    `(turbo y vitest directo) · ${[...siete.values()].reduce((s, x) => s + x.pruebas, 0)} pruebas`,
);

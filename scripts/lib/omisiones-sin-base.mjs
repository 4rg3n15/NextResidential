#!/usr/bin/env node
/**
 * CONTROL · con `--con-base`, una prueba OMITIDA por falta de base es un FALLO,
 * y se NOMBRA.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * H-15L-C01 · EL VERDE QUE NO HACÍA NADA
 *
 * La lista de visitas del residente salía siempre vacía contra PostgreSQL.
 * `apps/api/test/visitas-pg.test.ts` lo habría cazado, y estaba en verde: la
 * base local se había caído, su `beforeAll` dejó `disponible` en falso y cada
 * prueba salió por `if (omitida()) return;`. Una prueba que retorna antes de su
 * primera aserción no falla —PASA—, así que ni vitest la cuenta como saltada ni
 * el paso 5 (D-112) la veía. El verificador se había pedido con `--con-base`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DOS BARRERAS, Y ESTE FICHERO ES LA SEGUNDA
 *
 *  1 · `apps/api/test/base-exigida.ts`, con `NCR_BASE_EXIGIDA=1` (lo exporta el
 *      verificador con `--con-base`): la prueba sin base FALLA con su nombre y
 *      el texto `MARCA`. Sin la variable, pasa, pero MARCADA en el informe JSON
 *      (`meta.omitidaSinBase`).
 *  2 · Aquí se leen los informes del paso 5 y se nombra cada prueba marcada o
 *      fallada por esa causa; con `--exigida`, cualquiera es un fallo. Así no
 *      depende de que la variable llegue: si `turbo.json` la filtrara —D-112,
 *      otra vez—, las pruebas volverían a «pasar», marcadas, y aquí se verían.
 *
 * Y lo que hace imposible la vía lateral: en `apps/` y `packages/`, ningún
 * fichero de prueba lee `DATABASE_URL_PRUEBAS` por su cuenta —sólo el
 * ayudante—, y quien importa del ayudante registra el guardián `exigirBase`.
 * Sin esto, una suite nueva copiada del patrón viejo omitiría en silencio.
 *
 * Sin `--exigida` las omisiones siguen permitidas, y se cuentan por fichero.
 *
 *   node scripts/lib/omisiones-sin-base.mjs [--exigida] <raiz>
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const INFORME = '.informe-paso5.json';
const AYUDANTE = 'apps/api/test/base-exigida.ts';
/** El texto con que falla la prueba en `base-exigida.ts` (`MARCA_DE_OMISION`). */
const MARCA = 'OMISIÓN POR FALTA DE BASE con --con-base';

const argumentos = process.argv.slice(2);
const exigida = argumentos.includes('--exigida');
const raiz = argumentos.find((a) => !a.startsWith('--'));
if (raiz === undefined) {
  console.error('uso: omisiones-sin-base.mjs [--exigida] <raiz>');
  process.exit(2);
}

// ─── 1 · quién lee la base ──────────────────────────────────────────────────
const LEE_LA_BASE =
  /process\.env\s*(?:\.\s*DATABASE_URL_PRUEBAS\b|\[\s*['"`]DATABASE_URL_PRUEBAS['"`]\s*\])|\{[^}]*\bDATABASE_URL_PRUEBAS\b[^}]*\}\s*=\s*process\.env/;
const IMPORTA_AYUDANTE = /import\s*\{([^}]*)\}\s*from\s*['"][./\w-]*base-exigida['"]/;
const FUENTE = /\.[cm]?[jt]sx?$/;
// [SUPUESTO] S-106 · la regla estática mira sólo ficheros de prueba de `apps/` y
// `packages/`: los guiones de `scripts/` y el `e2e/` de la raíz no son suites de
// vitest y pueden leer la variable por su cuenta.
const ES_DE_PRUEBA = /(?:^|\/)(?:test|e2e|__tests__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const NO_SE_RECORRE = new Set([
  'node_modules',
  'dist',
  'coverage',
  'build',
  '.next',
  '.turbo',
  '.dart_tool',
  'ios',
  'android',
]);

/** Los ficheros de prueba de `apps/*` y `packages/*`. Acotado por el árbol. */
const ficherosDePrueba = (dir) => {
  const encontrados = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (NO_SE_RECORRE.has(e.name)) continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) encontrados.push(...ficherosDePrueba(ruta));
    else if (FUENTE.test(e.name)) encontrados.push(ruta);
  }
  return encontrados;
};

const indebidos = [];
let conGuardian = 0;
for (const grupo of ['apps', 'packages']) {
  const base = join(raiz, grupo);
  if (!existsSync(base)) continue;
  for (const fichero of ficherosDePrueba(base)) {
    const nombre = relative(raiz, fichero).split('\\').join('/');
    if (nombre === AYUDANTE || !ES_DE_PRUEBA.test(nombre)) continue;
    const texto = readFileSync(fichero, 'utf8');
    if (LEE_LA_BASE.test(texto)) {
      indebidos.push(`${nombre}: lee DATABASE_URL_PRUEBAS por su cuenta; impórtela de ${AYUDANTE}`);
      continue;
    }
    const importa = IMPORTA_AYUDANTE.exec(texto);
    if (importa === null) continue;
    const guardian = /\bexigirBase\b(?:\s+as\s+(\w+))?/.exec(importa[1]);
    const local = guardian?.[1] ?? 'exigirBase';
    const resto = texto.slice(0, importa.index) + texto.slice(importa.index + importa[0].length);
    if (guardian === null || !new RegExp(`\\b${local}\\(`).test(resto)) {
      indebidos.push(`${nombre}: importa de base-exigida.ts y no registra el guardián exigirBase`);
    } else {
      conGuardian += 1;
    }
  }
}

// ─── 2 · qué se omitió en el paso 5 ─────────────────────────────────────────
const omitidas = [];
let informes = 0;
for (const grupo of ['apps', 'packages']) {
  const base = join(raiz, grupo);
  if (!existsSync(base)) continue;
  for (const paquete of readdirSync(base)) {
    const ruta = join(base, paquete, INFORME);
    if (!existsSync(ruta)) continue;
    let datos;
    try {
      datos = JSON.parse(readFileSync(ruta, 'utf8'));
    } catch (e) {
      console.error(`FALLO ${relative(raiz, ruta)} no se pudo leer: ${e.message}`);
      process.exit(1);
    }
    informes += 1;
    for (const t of datos.testResults) {
      const fichero = String(t.name).replace(/.*?\/((?:apps|packages)\/)/, '$1');
      // El fichero entero no cargó: `base-exigida.ts` lanza al importarse.
      if (t.assertionResults.length === 0 && String(t.message).includes(MARCA)) {
        omitidas.push({ fichero, prueba: '(el fichero no cargó)', motivo: t.message });
      }
      for (const a of t.assertionResults) {
        const marcada = a.meta?.omitidaSinBase;
        const fallo = a.failureMessages.find((m) => m.includes(MARCA));
        if (marcada === undefined && fallo === undefined) continue;
        const motivo = marcada ?? fallo.split('\n')[0].split(': ').pop();
        omitidas.push({ fichero, prueba: a.fullName, motivo });
      }
    }
  }
}

if (informes === 0) {
  console.error(
    `FALLO no hay ningún ${INFORME} bajo ${raiz}: sin informes no hay nada que mirar,\n` +
      '  y un control que no mira nada y aprueba es el defecto que este persigue.',
  );
  process.exit(1);
}

for (const i of indebidos) console.error(`  ✗ ${i}`);

if (exigida) {
  for (const o of omitidas) {
    console.error(`  ✗ OMITIDA ${o.fichero} › ${o.prueba}`);
    console.error(`       motivo: ${String(o.motivo).replace(/\s+/g, ' ').slice(0, 200)}`);
  }
} else {
  const porFichero = new Map();
  for (const o of omitidas) porFichero.set(o.fichero, (porFichero.get(o.fichero) ?? 0) + 1);
  for (const [f, n] of [...porFichero].sort()) console.log(`  – ${f}: ${n} omitida(s)`);
}

const resumen =
  `${conGuardian} fichero(s) de prueba usan la base por ${AYUDANTE}, todos con su guardián · ` +
  `${informes} informe(s) leído(s)`;

if (indebidos.length > 0 || (exigida && omitidas.length > 0)) {
  console.error(
    `\nFALLO ${omitidas.length} prueba(s) omitida(s) por falta de base` +
      `${exigida ? ' con --con-base' : ''} y ${indebidos.length} fichero(s) fuera de la regla.\n` +
      '  Una prueba que retorna antes de su primera aserción no falla: PASA. Con --con-base\n' +
      '  la base es obligatoria; o se levanta la base, o se corre sin --con-base y se dice.',
  );
  process.exit(1);
}

console.log(
  omitidas.length === 0
    ? `omisiones por falta de base: ninguna · ${resumen}`
    : `omisiones por falta de base: ${omitidas.length}, permitidas sin --con-base · ${resumen}`,
);

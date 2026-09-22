#!/usr/bin/env node
/**
 * CONTROL · los dos recuentos del MISMO paquete tienen que coincidir.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * D-112 · DOS VEREDICTOS SOBRE LO MISMO, Y NADIE LOS COMPARABA
 *
 * El verificador ejecuta la suite DOS veces por caminos distintos:
 *
 *   · paso 5 → `pnpm test`, es decir **turbo**, que construye el entorno del
 *     proceso hijo a partir de lo que `turbo.json` declara.
 *   · paso 7 → `metricas.mjs`, que invoca **vitest directamente** y hereda el
 *     entorno entero.
 *
 * La corrida del usuario con la base ya correcta dejó la grieta a la vista: el
 * paso 5 informaba «@ncr/api: 653 passed | 5 skipped» y el paso 7 ejecutaba las
 * 658 sin saltarse ninguna. Las cinco eran las de `residente-pg.test.ts`, que
 * con la base buena PASAN. Bajo turbo no llegaban a correr porque
 * `turbo.json` no declaraba `DATABASE_URL_PRUEBAS`: Turborepo 2.x filtra el
 * entorno, la variable no alcanzaba a vitest y `it.runIf(URL_BASE !== undefined)`
 * las saltaba **en silencio**.
 *
 * Los dos pasos daban verde. Los dos mentían a medias. Y el verificador tenía
 * las dos cifras delante sin compararlas nunca — que es exactamente la misma
 * familia que «@ncr/api quedó FUERA de la medición»: el dato estaba, faltaba
 * quien lo mirase.
 *
 * Por eso este control no comprueba un umbral ni un formato: comprueba que dos
 * fuentes que deben decir lo mismo lo digan. Una divergencia significa que uno
 * de los dos caminos NO está ejecutando lo que cree, y da igual cuál: las dos
 * posibilidades son un falso verde.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/lib/recuentos-coherentes.mjs <salida-paso-5> <salida-paso-7>
 */
import { readFileSync } from 'node:fs';
import { sinColores } from './sin-colores.mjs';

const [ruta5, ruta7] = process.argv.slice(2);
if (!ruta5 || !ruta7) {
  console.error('uso: recuentos-coherentes.mjs <salida-paso-5> <salida-paso-7>');
  process.exit(2);
}

const leer = (ruta) => {
  try {
    return sinColores(readFileSync(ruta, 'utf8'));
  } catch (e) {
    console.error(`FALLO no se pudo leer ${ruta}: ${e.message}`);
    process.exit(1);
  }
};

/**
 * Paso 5 · turbo prefija cada línea con `<paquete>:test:`, y vitest escribe su
 * resumen con las tres cifras en cualquier orden y solo las que no son cero:
 *
 *     @ncr/api:test:       Tests  658 passed (658)
 *     @ncr/api:test:       Tests  653 passed | 5 skipped (658)
 *     @ncr/api:test:       Tests  1 failed | 657 passed (658)
 *
 * Se lee el total del paréntesis y cada cifra por su etiqueta, para no depender
 * del orden ni de cuáles aparecen.
 */
const delPaso5 = (texto) => {
  const porPaquete = new Map();
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^\s*(\S+):test:\s+Tests\s+(.+?)\s*\((\d+)\)\s*$/);
    if (!m) continue;
    const [, paquete, cuerpo, total] = m;
    const cifra = (etiqueta) => {
      const c = cuerpo.match(new RegExp(`(\\d+)\\s+${etiqueta}`));
      return c ? Number(c[1]) : 0;
    };
    // El último resumen de un paquete es el que vale: con `--force` puede
    // haber salidas repetidas y la buena es la que cierra la corrida.
    porPaquete.set(paquete, {
      pruebas: Number(total),
      verdes: cifra('passed'),
      rojas: cifra('failed'),
      saltadas: cifra('skipped') + cifra('todo'),
    });
  }
  return porPaquete;
};

/** Paso 7 · la línea que `metricas.mjs` escribe para ser leída, no para leerse. */
const delPaso7 = (texto) => {
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

const cinco = delPaso5(leer(ruta5));
const siete = delPaso7(leer(ruta7));

if (siete.size === 0) {
  console.error(
    'FALLO el paso 7 no dejó ninguna línea RECUENTO: sin ella no hay nada que comparar,\n' +
      '  y una comparación que no compara nada es el defecto que este control persigue.',
  );
  process.exit(1);
}
if (cinco.size === 0) {
  console.error(
    'FALLO no se reconoció ningún recuento del paso 5. O la suite no corrió, o turbo\n' +
      '  cambió el formato de sus líneas. En ninguno de los dos casos hay verde.',
  );
  process.exit(1);
}

const CAMPOS = ['pruebas', 'verdes', 'rojas', 'saltadas'];
const divergen = [];
for (const [paquete, b] of siete) {
  const a = cinco.get(paquete);
  if (a === undefined) {
    divergen.push({ paquete, motivo: 'el paso 5 no informó de este paquete', a: null, b });
    continue;
  }
  const distintos = CAMPOS.filter((c) => a[c] !== b[c]);
  if (distintos.length > 0) {
    divergen.push({ paquete, motivo: `difieren: ${distintos.join(', ')}`, a, b });
  }
}

const comoTexto = (x) => (x === null ? '(ausente)' : CAMPOS.map((c) => `${c}=${x[c]}`).join(' '));

if (divergen.length > 0) {
  console.error('FALLO los dos recuentos del mismo paquete NO coinciden:\n');
  for (const d of divergen) {
    console.error(`  ✗ ${d.paquete} — ${d.motivo}`);
    console.error(`      paso 5 (turbo)   : ${comoTexto(d.a)}`);
    console.error(`      paso 7 (directo) : ${comoTexto(d.b)}`);
  }
  console.error(
    '\n  Los dos pasos ejecutan la MISMA suite por caminos distintos. Si discrepan,\n' +
      '  uno de los dos NO está ejecutando lo que cree, y las dos posibilidades son\n' +
      '  un falso verde. La causa de D-112 fue que `turbo.json` no declaraba las\n' +
      '  variables de entorno de las que dependen las pruebas, así que turbo las\n' +
      '  filtraba y vitest saltaba en silencio las que necesitaban base de datos.\n' +
      '  Compruebe `env` en las tareas `test` y `test:cobertura` de turbo.json.',
  );
  process.exit(1);
}

console.log(
  `recuentos: ${siete.size} paquete(s) con el mismo resultado por los dos caminos ` +
    `(turbo y vitest directo) · ${[...siete.values()].reduce((s, x) => s + x.pruebas, 0)} pruebas`,
);

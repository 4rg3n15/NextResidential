#!/usr/bin/env node
/**
 * CONTROL · ningún paso declarado en `verificar-etapa.sh` deja de ejecutarse en
 * silencio.
 *
 * POR QUÉ EXISTE. El paso «12c · el camino del NAVEGADOR» nació dentro del
 * bloque `if [[ "$CON_BASE" == "1" ]]`, así que en una corrida sin base **no se
 * ejecutaba ni se omitía: no aparecía**. El usuario lo detectó leyendo la
 * salida y echándolo en falta — a mano, que es exactamente lo que un guion de
 * verificación existe para evitar. Un paso ausente no da ningún rojo; da una
 * salida más corta, y una salida más corta se lee como «todo bien».
 *
 * Es la misma familia que `contar-pruebas.mjs`: allí un fichero de prueba que
 * nadie recoge, aquí un control que nadie ejecuta. En los dos casos el síntoma
 * no es un fallo, es una ausencia.
 *
 * CÓMO. `verificar-etapa.sh` va anotando cada paso que ejecuta. Aquí se compara
 * esa lista con los `paso "…"` declarados en el propio guion. Los que solo
 * corren con base se declaran EN SU PROPIA ETIQUETA —«(requiere --con-base)»—,
 * de modo que la exención es visible para quien lee la salida y no un número
 * escondido aquí.
 *
 *   node scripts/lib/pasos-ejecutados.mjs <fichero-con-los-pasos> [--con-base]
 *   node scripts/lib/pasos-ejecutados.mjs <…> --guion <otro-verificar-etapa.sh>
 */
import { readFileSync } from 'node:fs';

const argumentos = process.argv.slice(2);
const conBase = argumentos.includes('--con-base');
const indiceGuion = argumentos.indexOf('--guion');
const guion = indiceGuion === -1 ? 'scripts/verificar-etapa.sh' : argumentos[indiceGuion + 1];
const fichero = argumentos.find((a) => !a.startsWith('--') && a !== guion);

if (fichero === undefined) {
  console.error('uso: pasos-ejecutados.mjs <fichero-con-los-pasos> [--con-base]');
  process.exit(2);
}

const EXENTO = /\(requiere --con-base\)/;

const declarados = readFileSync(guion, 'utf8')
  .split('\n')
  .map((linea) => /^\s*paso "([^"]+)"/.exec(linea))
  .filter((m) => m !== null)
  .map((m) => m[1]);

const ejecutados = new Set(
  readFileSync(fichero, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0),
);

const esperados = declarados.filter((etiqueta) => conBase || !EXENTO.test(etiqueta));
const ausentes = esperados.filter((etiqueta) => !ejecutados.has(etiqueta));

if (ausentes.length > 0) {
  console.error(`FALLO ${ausentes.length} paso(s) declarados que NO se ejecutaron:`);
  for (const etiqueta of ausentes) console.error(`  ${etiqueta}`);
  console.error('\nUn paso que no aparece en la salida no es una omisión: es un hueco.');
  process.exit(1);
}

const omitidos = declarados.length - esperados.length;
console.log(
  `OK ${esperados.length} de ${declarados.length} pasos ejecutados` +
    (omitidos > 0 ? `; ${omitidos} exentos por necesitar --con-base` : ''),
);

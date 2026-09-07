#!/usr/bin/env node
/**
 * Compara los ficheros de prueba que hay EN DISCO con los que el ejecutor llegó
 * a RECOGER.
 *
 * Qué detecta, comprobado por mutación: un fichero que existe y nadie ejecuta
 * porque el patrón `include` dejó de alcanzarlo, porque un paquete del
 * monorepo se quedó fuera de la corrida, o porque su script `test` no invoca al
 * ejecutor. En ese caso **no hay ningún rojo**: la suite informa «Test Files 4
 * passed · Tests 20 passed» y parece correcta.
 *
 * Qué NO detecta, y conviene no atribuírselo: un fichero que sí se recoge pero
 * falla al importar. Vitest lo marca como `Test Files N failed`, así que ese
 * caso lo atrapa el paso 4 —el de la suite en rojo— y no este.
 *
 * ESTÁ EN NODE Y NO EN SHELL (2026-09-07). La primera versión usaba
 * `paste -sd+ | bc`: `paste` de BSD no acepta esa sintaxis condensada, así que
 * en macOS devolvía cadena vacía y el control informaba «0 de 14» — el propio
 * mecanismo anti-falso-verde producía un falso negativo. Aritmética y recorrido
 * de directorios se hacen aquí, donde se comportan igual en las dos plataformas.
 *
 * Uso: node contar-pruebas.mjs <fichero-con-la-salida-de-vitest>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RAICES = ['apps', 'packages'];
const IGNORADOS = new Set(['node_modules', 'dist', 'coverage', '.turbo', '.git']);

const enDisco = (dir, acumulado = []) => {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acumulado;
  }
  for (const e of entradas) {
    if (IGNORADOS.has(e.name)) continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) enDisco(ruta, acumulado);
    else if (/\.(test|spec)\.ts$/.test(e.name)) acumulado.push(ruta);
  }
  return acumulado;
};

const salidaPath = process.argv[2];
if (!salidaPath) {
  console.error('uso: contar-pruebas.mjs <fichero-con-la-salida>');
  process.exit(2);
}

const raiz = resolve(process.cwd());
const ficheros = RAICES.flatMap((r) => {
  const d = join(raiz, r);
  try {
    return statSync(d).isDirectory() ? enDisco(d) : [];
  } catch {
    return [];
  }
});

const salida = readFileSync(salidaPath, 'utf8');

/**
 * Vitest imprime «Test Files  N passed (N)» y, cuando hay rojos,
 * «Test Files  1 failed | 4 passed (5)». Se suman TODOS los números que
 * preceden a un estado, una línea por paquete del monorepo.
 */
let recogidos = 0;
for (const linea of salida.split('\n')) {
  const cabecera = linea.match(/Test Files\s+(.+)$/);
  if (!cabecera) continue;
  for (const m of cabecera[1].matchAll(/(\d+)\s+(passed|failed|skipped|todo)/g)) {
    recogidos += Number(m[1]);
  }
}

if (recogidos >= ficheros.length && ficheros.length > 0) {
  console.log(`OK ${recogidos} de ${ficheros.length} ficheros de prueba ejecutados`);
  process.exit(0);
}
console.log(
  `FALLO solo ${recogidos} de ${ficheros.length} ficheros de prueba fueron recogidos ` +
    `(hay ficheros *.test.ts que nadie ejecuta: revisar los patrones \`include\` y ` +
    `que todos los paquetes entren en la corrida)`,
);
process.exit(1);

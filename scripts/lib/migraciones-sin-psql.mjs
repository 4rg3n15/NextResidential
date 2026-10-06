#!/usr/bin/env node
/**
 * NINGUNA MIGRACIÓN LLEVA ÓRDENES DE `psql`.
 *
 * POR QUÉ EXISTE (2026-10-06, víspera de sitio). La 0052 y la 0053 llevaban
 * `\set ON_ERROR_STOP on`. Es una orden del CLIENTE `psql`, no SQL: el
 * verificador aplica las migraciones con `psql -f` y la entendía, así que el CI
 * estuvo en verde; `supabase db push` manda el texto al SERVIDOR, que no sabe
 * qué es, y la base real se detuvo en la 0052 con «syntax error at or near "\"».
 * El verificador ya pasa `-v ON_ERROR_STOP=1`: la línea no aportaba nada.
 *
 * Es la familia de siempre: el banco y el despliegue no ejecutan lo mismo, y lo
 * que el banco acepta no dice nada de lo que el despliegue acepta. Este control
 * lee el SQL versionado y rechaza toda línea que empiece por `\` fuera de un
 * comentario: en una migración, eso sólo puede ser una orden de `psql`.
 *
 *   node scripts/lib/migraciones-sin-psql.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Se lee el DIRECTORIO: una migración recién escrita aún no está en el índice. */
const DIRECTORIO = 'supabase/migrations';
const ficheros = readdirSync(DIRECTORIO)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => join(DIRECTORIO, f));

const ordenDePsql = /^\s*\\/;

const hallazgos = ficheros.flatMap((fichero) =>
  readFileSync(fichero, 'utf8')
    .split('\n')
    .map((linea, i) => ({ fichero, numero: i + 1, linea }))
    .filter(({ linea }) => ordenDePsql.test(linea)),
);

if (hallazgos.length > 0) {
  console.error(
    `orden(es) de psql en las migraciones: ${hallazgos.length}\n` +
      '`supabase db push` envía el SQL al servidor, que no entiende órdenes del\n' +
      'cliente psql (`\\set`, `\\i`, `\\if`…): la migración falla en la base real\n' +
      'aunque el verificador, que aplica con `psql -f`, la acepte.\n',
  );
  for (const { fichero, numero, linea } of hallazgos) {
    console.error(`  ${fichero}:${numero}  ${linea.trim()}`);
  }
  process.exit(1);
}

console.log(
  `migraciones sin órdenes de psql: ${ficheros.length} fichero(s), todas aplicables con supabase db push`,
);

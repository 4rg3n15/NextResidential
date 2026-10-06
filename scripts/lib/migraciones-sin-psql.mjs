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
 * CÓMO LA RECONOCE. Como `psql`: una `\` es orden suya si está FUERA de un
 * comentario, una cadena, un identificador entre comillas o un cuerpo `$…$`, y
 * eso vale también a mitad de línea (`SELECT 1; \set …`, que la documentación
 * de psql admite). Mirar sólo el principio de la línea dejaba pasar esa forma;
 * buscar cualquier `\` marcaría las expresiones regulares de los CHECK
 * (`'[\x00-\x1F]'`). Los comentarios de bloque no se anidan aquí: ninguna
 * migración lo hace, y uno anidado se leería como código, nunca al revés.
 *
 *   node scripts/lib/migraciones-sin-psql.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Índice de `aguja` desde `desde`, o el final del texto si no aparece. */
const hasta = (sql, aguja, desde) => {
  const i = sql.indexOf(aguja, desde);
  return i < 0 ? sql.length : i;
};

/** Fin de una cadena `'…'`; en una `E'…'` la `\` escapa el carácter siguiente. */
const finDeCadena = (sql, inicio, conEscapes) => {
  let i = inicio + 1;
  while (i < sql.length) {
    if (conEscapes && sql[i] === '\\') i += 2;
    else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
    else if (sql[i] === "'") return i + 1;
    else i += 1;
  }
  return sql.length;
};

const etiquetaDolar = /\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/y;

/**
 * Si en `i` empieza algo que no es código (comentario, cadena, identificador
 * entre comillas o cuerpo `$…$`), dónde termina; si no, `i`.
 */
const saltarNoCodigo = (sql, i) => {
  if (sql.startsWith('--', i)) return hasta(sql, '\n', i);
  if (sql.startsWith('/*', i)) return Math.min(hasta(sql, '*/', i + 2) + 2, sql.length);
  if (sql[i] === '"') return Math.min(hasta(sql, '"', i + 1) + 1, sql.length);
  if (sql[i] === "'") return finDeCadena(sql, i, /(?:^|[^A-Za-z0-9_])[Ee]$/.test(sql.slice(0, i)));
  etiquetaDolar.lastIndex = i;
  const etiqueta = etiquetaDolar.exec(sql);
  if (etiqueta === null) return i;
  const desde = i + etiqueta[0].length;
  return Math.min(hasta(sql, etiqueta[0], desde) + etiqueta[0].length, sql.length);
};

/** Número de línea (desde 1) de cada `\` que psql tomaría por orden suya. */
const lineasConOrdenDePsql = (sql) => {
  const lineas = [];
  let i = 0;
  while (i < sql.length) {
    const fin = saltarNoCodigo(sql, i);
    if (fin > i) {
      i = fin;
      continue;
    }
    if (sql[i] === '\\') lineas.push(sql.slice(0, i).split('\n').length);
    i += 1;
  }
  return lineas;
};

/** Se lee el DIRECTORIO: una migración recién escrita aún no está en el índice. */
const DIRECTORIO = 'supabase/migrations';
const ficheros = readdirSync(DIRECTORIO)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => join(DIRECTORIO, f));

const hallazgos = ficheros.flatMap((fichero) => {
  const sql = readFileSync(fichero, 'utf8');
  const texto = sql.split('\n');
  return lineasConOrdenDePsql(sql).map((numero) => ({
    fichero,
    numero,
    linea: texto[numero - 1],
  }));
});

if (hallazgos.length > 0) {
  console.error(
    `orden(es) de psql en las migraciones: ${hallazgos.length}\n` +
      '`supabase db push` envía el SQL al servidor, que no entiende órdenes del\n' +
      'cliente psql (`\\set`, `\\i`, `\\if`, `\\gexec`…): la migración falla en la base\n' +
      'real aunque el verificador, que aplica con `psql -f`, la acepte.\n',
  );
  for (const { fichero, numero, linea } of hallazgos) {
    console.error(`  ${fichero}:${numero}  ${linea.trim()}`);
  }
  process.exit(1);
}

console.log(
  `migraciones sin órdenes de psql: ${ficheros.length} fichero(s), todas aplicables con supabase db push`,
);

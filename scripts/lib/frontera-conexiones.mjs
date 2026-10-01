#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-O · NINGUNA CONEXIÓN A POSTGRESQL SIN OYENTE DE `'error'`
 *
 * En sitio (30/09/2026) el pooler de sesión de Supabase cortó conexiones y la
 * API murió entera: «Unhandled 'error' event · Connection terminated
 * unexpectedly». `pg` emite `'error'` en el cliente —y el pool lo re-emite—
 * cuando la conexión se pierde, y un `'error'` sin oyente termina Node.
 *
 * QUÉ SE COMPRUEBA, en el código que se ejecuta (no en las pruebas):
 *
 *  1. PRÉSTAMO. Nadie llama a `.connect()` sobre un pool fuera del ayudante
 *     único (`con-cliente.ts` en la API, `con-cliente.mjs` en los guiones):
 *     el ayudante es quien pone y quita el oyente y descarta la conexión rota.
 *     Un `Client` suelto sí puede conectarse a sí mismo; el punto 2 lo cubre.
 *  2. OYENTE. Todo `new Pool(`, `new Client(` y `new PgBoss(` va envuelto en
 *     `vigilarPool(...)` o su variable tiene `.on('error', …)` en el mismo
 *     fichero.
 *
 *   node scripts/lib/frontera-conexiones.mjs            # el repositorio
 *   node scripts/lib/frontera-conexiones.mjs <dir>…     # otro árbol (sondas)
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const RAICES = ['apps/api/src', 'packages', 'scripts', 'e2e'];
const raices = process.argv.length > 2 ? process.argv.slice(2) : RAICES;

const AYUDANTES = new Set(['con-cliente.ts', 'con-cliente.mjs']);
/**
 * La suite negativa ESCRIBE las sondas de este control como texto: no abre
 * ninguna conexión, y leerla sería marcar las violaciones que siembra a
 * propósito.
 */
const BANCOS = new Set(['pruebas-negativas.mjs']);

const ficheros = [];
const recorrer = (dir) => {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist' || nombre === '.next') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta);
    else if (
      /\.(ts|mjs|js)$/.test(nombre) &&
      !/\.test\.(ts|mjs)$/.test(nombre) &&
      !BANCOS.has(nombre)
    ) {
      ficheros.push(ruta);
    }
  }
};
for (const r of raices) if (existsSync(r)) recorrer(r);

/** El código sin comentarios, conservando los saltos de línea para citar la línea. */
const sinComentarios = (texto) =>
  texto
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, (_, previo) => previo);

const lineaDe = (texto, indice) => texto.slice(0, indice).split('\n').length;

const faltas = [];
let construcciones = 0;

for (const fichero of ficheros) {
  const codigo = sinComentarios(readFileSync(fichero, 'utf8'));
  if (!/\b(Pool|Client|PgBoss)\b|\.connect\(/.test(codigo)) continue;
  const donde = (i) => `${relative(process.cwd(), fichero)}:${String(lineaDe(codigo, i))}`;

  // Variables que son un `Client` suelto: esas sí se conectan a sí mismas.
  const clientesSueltos = new Set(
    [...codigo.matchAll(/(\w+)\s*=\s*new\s+(?:pg\.)?Client\(/g)].map((m) => m[1]),
  );

  if (!AYUDANTES.has(basename(fichero))) {
    for (const m of codigo.matchAll(/(\w+)\s*\.\s*connect\(\s*\)/g)) {
      if (clientesSueltos.has(m[1])) continue;
      faltas.push(
        `${donde(m.index)} \`${m[1]}.connect()\` presta un cliente a mano: use \`conCliente(pool, fn)\``,
      );
    }
  }

  for (const m of codigo.matchAll(/new\s+(?:pg\.)?(Pool|Client|PgBoss)\(/g)) {
    construcciones += 1;
    const antes = codigo.slice(Math.max(0, m.index - 120), m.index);
    if (/vigilarPool\(\s*$/.test(antes)) continue;
    const variable = /(?:this\.)?(\w+)\s*=\s*(?:await\s+)?$/.exec(antes)?.[1];
    if (variable === undefined) {
      faltas.push(
        `${donde(m.index)} \`new ${m[1]}(\` sin variable ni \`vigilarPool(\`: no se puede comprobar su oyente de 'error'`,
      );
      continue;
    }
    const oyente = new RegExp(`\\b${variable}\\s*\\.\\s*on\\(\\s*['"]error['"]`);
    if (!oyente.test(codigo)) {
      faltas.push(
        `${donde(m.index)} \`${variable} = new ${m[1]}(\` sin \`${variable}.on('error', …)\`: un corte de la base termina el proceso`,
      );
    }
  }
}

if (faltas.length > 0) {
  console.error(
    `FALLO ${String(faltas.length)} conexión(es) a PostgreSQL pueden tumbar el proceso ante un corte (15-O):`,
  );
  for (const f of faltas) console.error(`  ${f}`);
  console.error(
    "\n  `pg` emite 'error' cuando la base corta la conexión, y un 'error' sin oyente\n" +
      "  termina Node. Preste con `conCliente(pool, fn)` y escuche 'error' en cada pool.",
  );
  process.exit(1);
}

console.log(
  `OK ${String(construcciones)} pools/clientes con oyente de 'error' y ningún préstamo fuera de conCliente`,
);

#!/usr/bin/env node
/**
 * Compara cada `.env` real con su `.env.example` y dice qué falta.
 *
 * POR QUÉ EXISTE (petición del cliente, 2026-09-10). Cada etapa añade
 * variables, y el cliente las descubría **al arrancar**: una a una, arrancando,
 * leyendo el fallo, añadiendo la que faltaba, arrancando otra vez. La
 * información para evitarlo estaba en el repositorio desde el principio —los
 * `.env.example` la llevan— pero nada la comparaba con lo que él tenía.
 *
 * Tres cosas que este guion hace y que no son obvias:
 *
 *  1. **Nunca imprime un valor.** Solo nombres. Un comparador de configuración
 *     que vuelca el contenido acaba pegado en un chat o en un ticket con la
 *     llave secreta dentro.
 *  2. **Comprueba el salto de línea final**, que es lo que rompió el `.env` del
 *     cliente: sin él, la siguiente variable que se añada se funde con la
 *     última y corrompe las dos (D-61).
 *  3. **Distingue obligatoria de opcional.** En los `.example` lo opcional va
 *     comentado con su nombre —`# MFA_OBLIGATORIO=false`—, y anunciar eso como
 *     «falta» enseñaría a ignorar la salida del guion.
 *
 * Va en Node y no en shell por la regla de portabilidad del repositorio: el
 * desarrollo es macOS y el CI es Linux.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(import.meta.dirname, '..', '..');

/** Nombre de variable al principio de línea, con o sin comentario delante. */
const NOMBRE = /^\s*(#\s*)?([A-Z][A-Z0-9_]*)\s*=/;

const leerDeclaraciones = (ruta) => {
  const obligatorias = new Set();
  const opcionales = new Set();
  /**
   * Una variable que el propio `.example` deja vacía —`PUENTE_VIDEO_URL=`— se
   * declara SIN valor a propósito: significa «todavía no la hay». Exigirle
   * contenido en el `.env` real sería inventarse un requisito que el ejemplo
   * no impone, y un guion que señala cosas que no son problemas se ignora.
   */
  const admitenVacio = new Set();
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = NOMBRE.exec(linea);
    if (!m) continue;
    (m[1] ? opcionales : obligatorias).add(m[2]);
    if (!m[1] && linea.slice(linea.indexOf('=') + 1).trim() === '') admitenVacio.add(m[2]);
  }
  // Una variable comentada Y descomentada en el mismo fichero es obligatoria:
  // el comentario suele ser un ejemplo de valor alternativo.
  for (const n of obligatorias) opcionales.delete(n);
  return { obligatorias, opcionales, admitenVacio };
};

const leerDefinidas = (ruta) => {
  const definidas = new Map();
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = NOMBRE.exec(linea);
    if (!m || m[1]) continue;
    definidas.set(m[2], linea.slice(linea.indexOf('=') + 1).trim());
  }
  return definidas;
};

const aplicaciones = readdirSync(resolve(raiz, 'apps'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((n) => existsSync(resolve(raiz, 'apps', n, '.env.example')));

let problemas = 0;
let avisos = 0;
const sinFichero = [];

for (const app of aplicaciones) {
  const dirApp = resolve(raiz, 'apps', app);
  const ejemplo = resolve(dirApp, '.env.example');
  const real = resolve(dirApp, '.env');
  const { obligatorias, opcionales, admitenVacio } = leerDeclaraciones(ejemplo);

  if (!existsSync(real)) {
    sinFichero.push({ app, cuantas: obligatorias.size });
    continue;
  }

  const definidas = leerDefinidas(real);
  const faltan = [...obligatorias].filter((n) => !definidas.has(n));
  const vacias = [...obligatorias].filter((n) => definidas.get(n) === '' && !admitenVacio.has(n));
  const desconocidas = [...definidas.keys()].filter(
    (n) => !obligatorias.has(n) && !opcionales.has(n),
  );

  // El valor que se tragó el nombre de otra variable (D-61). Se busca solo
  // entre los nombres declarados en el propio `.example`: cualquier `algo=`
  // daría falsos positivos con las cadenas de conexión.
  const conocidos = [...obligatorias, ...opcionales];
  const pegadas = [];
  for (const [nombre, valor] of definidas) {
    const otra = conocidos.find((o) => o !== nombre && valor.includes(`${o}=`));
    if (otra) pegadas.push([nombre, otra]);
  }

  const contenido = readFileSync(real, 'utf8');
  const sinSaltoFinal = contenido.length > 0 && !contenido.endsWith('\n');

  const hayAlgo =
    faltan.length || vacias.length || desconocidas.length || pegadas.length || sinSaltoFinal;
  console.log(`\napps/${app}/.env  ${hayAlgo ? '' : '· al día'}`);

  for (const [nombre, otra] of pegadas) {
    problemas++;
    console.log(
      `  ✗ ${nombre}: su valor contiene «${otra}=» pegado. El fichero se quedó sin salto de`,
    );
    console.log(
      `    línea y las dos variables se fundieron: ${nombre} está corrupta y ${otra} no existe`,
    );
  }
  if (faltan.length) {
    problemas += faltan.length;
    console.log(`  ✗ faltan ${faltan.length}: ${faltan.join(', ')}`);
  }
  if (vacias.length) {
    problemas += vacias.length;
    console.log(`  ✗ declaradas pero vacías: ${vacias.join(', ')}`);
  }
  if (desconocidas.length) {
    avisos += desconocidas.length;
    console.log(`  ⚠ no están en el .example (¿errata?): ${desconocidas.join(', ')}`);
  }
  if (sinSaltoFinal) {
    avisos++;
    console.log('  ⚠ el fichero no termina en salto de línea: la próxima variable que añada');
    console.log('    se fundirá con la última (D-61)');
  }
}

if (sinFichero.length) {
  console.log('\nsin .env todavía:');
  for (const { app, cuantas } of sinFichero) {
    console.log(`  · apps/${app} — copie .env.example y rellene sus ${cuantas} variables`);
  }
}

console.log(
  `\n${problemas === 0 ? '✓' : '✗'} ${problemas} problema(s), ${avisos} aviso(s). ` +
    'Este guion no imprime ningún valor, solo nombres.',
);
process.exit(problemas === 0 ? 0 : 1);

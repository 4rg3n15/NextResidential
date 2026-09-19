#!/usr/bin/env node
/**
 * CONTROL · cobertura de la app Flutter, **por capa**.
 *
 * §2.4 exige 90 % en dominio y aplicación y 70 % global, y §2.8.0 añade la
 * lección que costó descubrir: medirlo en agregado esconde una capa por debajo
 * —`aplicacion` estuvo al 79 % sin que nadie lo midiera—. Aquí se aplica lo
 * mismo al código Dart, con dos diferencias propias de esta app:
 *
 *  - **El código generado no cuenta.** `lib/infraestructura/api/generado/**` y
 *    los `.g.dart` los escribe un generador; incluirlos inflaría el global con
 *    miles de líneas que nadie mantiene y taparía justo lo que hay que vigilar.
 *  - **La presentación tiene su propio umbral, más bajo y declarado.** Pintar
 *    widgets se prueba con pruebas de widget, que son lentas y frágiles si se
 *    persigue el 90 %. Lo que sí se exige al 90 % es el dominio y la aplicación,
 *    que es donde vive la política de sesión.
 *
 *   node scripts/lib/cobertura-flutter.mjs [ruta-lcov]
 */
import { readFileSync, existsSync } from 'node:fs';

const ruta = process.argv[2] ?? 'apps/mobile/coverage/lcov.info';

if (!existsSync(ruta)) {
  console.error(`FALLO no hay informe de cobertura en ${ruta}`);
  console.error('La suite tiene que correr con `flutter test --coverage`.');
  process.exit(1);
}

/** Capas, en orden de especificidad: la primera que casa manda. */
const CAPAS = [
  { nombre: 'generado', patron: /^lib\/infraestructura\/api\/generado\//, umbral: null },
  { nombre: 'generado', patron: /\.g\.dart$/, umbral: null },
  { nombre: 'dominio', patron: /^lib\/dominio\//, umbral: 90 },
  { nombre: 'aplicacion', patron: /^lib\/aplicacion\//, umbral: 90 },
  { nombre: 'configuracion', patron: /^lib\/configuracion\//, umbral: 70 },
  { nombre: 'infraestructura', patron: /^lib\/infraestructura\//, umbral: 60 },
  { nombre: 'presentacion', patron: /^lib\/presentacion\//, umbral: 50 },
  { nombre: 'resto', patron: /.*/, umbral: 0 },
];

const totales = new Map();
const acumular = (capa, alcanzadas, total) => {
  const actual = totales.get(capa) ?? { alcanzadas: 0, total: 0 };
  actual.alcanzadas += alcanzadas;
  actual.total += total;
  totales.set(capa, actual);
};

let ficheroActual = null;
let alcanzadas = 0;
let total = 0;

for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
  if (linea.startsWith('SF:')) {
    ficheroActual = linea.slice(3).trim();
    alcanzadas = 0;
    total = 0;
  } else if (linea.startsWith('DA:')) {
    const [, golpes] = linea.slice(3).split(',');
    total += 1;
    if (Number(golpes) > 0) alcanzadas += 1;
  } else if (linea.startsWith('end_of_record') && ficheroActual !== null) {
    const capa = CAPAS.find((c) => c.patron.test(ficheroActual))?.nombre ?? 'resto';
    acumular(capa, alcanzadas, total);
    ficheroActual = null;
  }
}

const porcentaje = ({ alcanzadas, total }) => (total === 0 ? 100 : (alcanzadas * 100) / total);

let fallos = 0;
let globalAlcanzadas = 0;
let globalTotal = 0;

for (const { nombre, umbral } of CAPAS) {
  if (umbral === null) continue;
  const datos = totales.get(nombre);
  if (datos === undefined || datos.total === 0) continue;
  globalAlcanzadas += datos.alcanzadas;
  globalTotal += datos.total;
  const p = porcentaje(datos);
  const marca = p >= umbral ? '✓' : '✗';
  console.log(
    `   ${marca} ${nombre.padEnd(16)} ${p.toFixed(2).padStart(6)} % ` +
      `(umbral ${umbral} %, ${datos.alcanzadas}/${datos.total} líneas)`,
  );
  if (p < umbral) fallos += 1;
}

const global = porcentaje({ alcanzadas: globalAlcanzadas, total: globalTotal });
const UMBRAL_GLOBAL = 70;
console.log(
  `   ${global >= UMBRAL_GLOBAL ? '✓' : '✗'} ${'global'.padEnd(16)} ` +
    `${global.toFixed(2).padStart(6)} % (umbral ${UMBRAL_GLOBAL} %, sin contar lo generado)`,
);
if (global < UMBRAL_GLOBAL) fallos += 1;

const generado = totales.get('generado');
if (generado !== undefined) {
  console.log(`   – ${generado.total} líneas generadas, excluidas del cómputo a propósito`);
}

if (fallos > 0) {
  console.error(`\nFALLO ${fallos} capa(s) por debajo de su umbral.`);
  process.exit(1);
}

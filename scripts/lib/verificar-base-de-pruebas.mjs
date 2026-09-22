#!/usr/bin/env node
/**
 * CONTROL · la base que `--con-base` promete está ahí, y contesta.
 *
 * POR QUÉ. Los pasos 12, 12b y 13 dan por hecha una PostgreSQL alcanzable. Si
 * no lo está —no arrancó, murió a mitad, el puerto es otro— los tres fallan con
 * mensajes que hablan de otra cosa: «suite SQL (ver el log)», «el arranque en
 * frío está roto», «OMITIDA: no se alcanzó la base». Tres síntomas y ninguna
 * causa, cuarenta minutos de ejecución más tarde.
 *
 * Esto lo pregunta al principio y lo dice con el nombre del host, el puerto y
 * la base, que es lo que hace falta para arreglarlo.
 *
 * Es el mismo criterio que el resto de esta ronda: **el entorno se comprueba
 * antes, no se diagnostica después.**
 *
 *   node scripts/lib/verificar-base-de-pruebas.mjs
 */
import { createRequire } from 'node:module';

const url = process.env.DATABASE_URL_PRUEBAS;
if (url === undefined || url === '') {
  console.error('FALLO se pidió --con-base y DATABASE_URL_PRUEBAS no está definida.');
  process.exit(1);
}

const require = createRequire(`${process.cwd()}/apps/api/package.json`);
let Client;
try {
  ({ Client } = require('pg'));
} catch {
  console.error('FALLO no se pudo cargar `pg`: ejecute `pnpm install` antes de este paso.');
  process.exit(1);
}

/** Descripción legible sin la contraseña, que no se imprime jamás. */
const describir = (cadena) => {
  try {
    const u = new URL(cadena);
    return `${u.hostname}:${u.port || 5432}/${u.pathname.replace(/^\//, '') || '(sin base)'} como ${u.username || '(sin usuario)'}`;
  } catch {
    return '(cadena de conexión ilegible)';
  }
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * D-107 · «CONTESTA» NO ES «SIRVE».
 *
 * Este control preguntaba `select version()` y daba la base por buena. La
 * primera corrida del verificador en un runner de CI —una base recién creada y
 * VACÍA— lo demostró caro: el control dijo «base de pruebas: … conectado como
 * postgres», y cuatro minutos después el paso 7 informaba «SUITE EN ROJO · 5
 * prueba(s) fallaron de 658» sin ninguna relación aparente con la base. Las
 * cinco eran de `residente-pg.test.ts`, y fallaban porque no había esquema.
 *
 * En la máquina del usuario y en la de desarrollo esto era INVISIBLE: los dos
 * clústeres llevaban el esquema y las semillas puestos de corridas anteriores.
 * Es, otra vez, un estado del entorno que nadie declara y del que todo depende
 * —la misma forma que el `dist/` viejo de la ETAPA 04—.
 *
 * Así que el control pregunta ahora las tres cosas que los pasos 5, 7, 12, 12b
 * y 13 necesitan de verdad: que conteste, que tenga ESQUEMA y que tenga
 * SEMILLAS. Y nombra el remedio exacto, que es un solo comando.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const REMEDIO = './supabase/verificar.sh --con-semillas --modo-supabase';

const cliente = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await cliente.connect();
  const { rows } = await cliente.query('select version() as v, current_user as u');
  const version = String(rows[0].v).split(',')[0];

  // `to_regclass` devuelve null si la tabla no existe, sin lanzar: es la forma
  // de preguntar por el esquema sin tratar el «no está» como un error de SQL.
  const { rows: esq } = await cliente.query(
    "select to_regclass('public.eventos') as eventos, to_regclass('public.copropiedades') as copropiedades",
  );
  const faltan = Object.entries(esq[0])
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  if (faltan.length > 0) {
    console.error(`FALLO la base de ${describir(url)} contesta pero NO tiene el esquema.`);
    console.error(`  No existe(n): ${faltan.join(', ')}`);
    console.error(
      '\n  Una base que responde no es una base utilizable. Sin esquema, las pruebas\n' +
        '  que lo necesitan fallan LEJOS de aquí y con mensajes que no la nombran.\n' +
        `  Aplíquelo:  ${REMEDIO}`,
    );
    process.exit(1);
  }

  const { rows: sem } = await cliente.query('select count(*)::int as n from public.copropiedades');
  if (sem[0].n === 0) {
    console.error(`FALLO la base de ${describir(url)} tiene esquema pero NINGUNA semilla.`);
    console.error(
      '\n  Los pasos 12b y 13 dan por hecha la copropiedad de las semillas, y sin ella\n' +
        '  las pruebas contra base se omiten o fallan por lo que parece otra cosa.\n' +
        `  Siémbrela:  ${REMEDIO}`,
    );
    process.exit(1);
  }

  console.log(
    `base de pruebas: ${describir(url)} · ${version} · conectado como ${rows[0].u} ` +
      `· esquema presente · ${sem[0].n} copropiedad(es) sembrada(s)`,
  );
} catch (e) {
  console.error(`FALLO no se pudo usar la base de pruebas en ${describir(url)}`);
  console.error(`  ${e.code ?? ''} ${e.message}`.trim());
  console.error(
    '\n  Sin ella, los pasos 12, 12b y 13 fallan con mensajes que no nombran la causa.\n' +
      '  Arranque la base o corrija DATABASE_URL_PRUEBAS antes de pedir --con-base.',
  );
  process.exit(1);
} finally {
  await cliente.end().catch(() => {});
}

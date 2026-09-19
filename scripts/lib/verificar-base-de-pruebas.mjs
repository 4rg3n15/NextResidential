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

const cliente = new Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await cliente.connect();
  const { rows } = await cliente.query('select version() as v, current_user as u');
  const version = String(rows[0].v).split(',')[0];
  console.log(`base de pruebas: ${describir(url)} · ${version} · conectado como ${rows[0].u}`);
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

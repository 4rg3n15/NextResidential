#!/usr/bin/env node
/**
 * F2 (15-R) · Herramienta de operador: rota `EQUIPOS_LLAVE`, la llave maestra
 * de la bóveda de equipos en la nube. Procedimiento completo, con su orden y su
 * ventana: `docs/guias/CONEXION_SUPABASE.md` §13. La lógica es la de la API
 * (`equipos/infraestructura/rotacion-de-la-boveda-pg.ts`, probada contra
 * PostgreSQL bajo RLS); esto sólo la arranca. Vive aquí y no en `apps/api/src`
 * porque es OTRO proceso, con su propio `Pool` de una conexión (D-66 rige
 * dentro de la API).
 *
 *   pnpm --filter @ncr/api build
 *   gcloud secrets versions access <ANTERIOR> --secret=equipos-llave \
 *     | DATABASE_URL=… EQUIPOS_LLAVE=<nueva> EQUIPOS_LLAVE_REF=vault:equipos-llave/v<N> \
 *       node scripts/rotar-llave-de-equipos.mjs
 *
 * La llave ANTERIOR entra por la entrada estándar y no por una variable: no
 * queda en el entorno del proceso ni en el historial de la terminal, y no se
 * declara en `.env.example` como si la API la leyera (no la lee). Escribe un
 * resumen con recuentos; jamás una llave ni un secreto.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const compilado = join(raiz, 'apps/api/dist/equipos/infraestructura/rotacion-de-la-boveda-pg.js');
if (!existsSync(compilado)) {
  console.error('FALTA la compilación de la API. Ejecute antes: pnpm --filter @ncr/api build');
  process.exit(2);
}
const requerir = createRequire(join(raiz, 'apps/api/package.json'));
const { rotarLlaveDeEquipos } = requerir(compilado);
const { Pool } = requerir('pg');

const leerLaAnterior = async () => {
  if (process.stdin.isTTY) {
    throw new Error('la llave anterior se pasa por la entrada estándar (tubería), no tecleada');
  }
  const trozos = [];
  for await (const trozo of process.stdin) trozos.push(Buffer.from(trozo));
  return Buffer.concat(trozos).toString('utf8').trim();
};

try {
  const anterior = await leerLaAnterior();
  const { DATABASE_URL, EQUIPOS_LLAVE, EQUIPOS_LLAVE_REF } = process.env;
  if (!DATABASE_URL || !EQUIPOS_LLAVE || !EQUIPOS_LLAVE_REF) {
    throw new Error('faltan DATABASE_URL, EQUIPOS_LLAVE (la nueva) o EQUIPOS_LLAVE_REF (la nueva)');
  }
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });
  try {
    const informe = await rotarLlaveDeEquipos(pool, {
      anterior,
      nueva: EQUIPOS_LLAVE,
      referenciaNueva: EQUIPOS_LLAVE_REF,
    });
    console.log(`rotación hecha: ${JSON.stringify(informe)}`);
  } finally {
    await pool.end();
  }
} catch (error) {
  // Cada copropiedad es atómica y lo ya rotado se salta: repetirla termina el trabajo.
  const motivo = error instanceof Error ? error.message : 'fallo no identificado';
  console.error(`rotación NO terminada; corríjalo y repítala: ${motivo}`);
  process.exitCode = 1;
}

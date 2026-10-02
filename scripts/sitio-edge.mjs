#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * pnpm sitio:edge · 15-Q (Q7) · EL EDGE GATEWAY, COMPROBADO EN SITIO
 *
 * Compila el Edge con sus dependencias y ejecuta su diagnóstico
 * (`apps/edge/src/diagnostico-de-sitio.ts`): el MISMO validador, el mismo
 * cliente firmado y el mismo diagnóstico de equipos que usa el gateway. Aquí
 * no se reimplementa nada, porque un diagnóstico que pregunta distinto que el
 * gateway da verdes que el gateway no tiene.
 *
 *   pnpm sitio:edge                          # apps/edge/.env
 *   pnpm sitio:edge -- --env=<ruta>          # el .env del gateway, si vive en otro sitio
 *
 * En el equipo del Edge, ya compilado, lo mismo sin pnpm:
 *   node --env-file=<ruta del .env> apps/edge/dist/diagnostico-de-sitio.js
 *
 * Sólo lee: la descarga de reglas no se guarda y ningún equipo se acciona.
 * Nunca imprime una IP, un usuario ni una clave (RN-21).
 *
 * Salida: 0 sin fallos · 1 algún FALLO · 2 configuración incompleta.
 * Procedimiento completo en docs/guias/DESPLIEGUE_EDGE.md §2.4.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = process.argv.find((a) => a.startsWith('--env='))?.slice('--env='.length);
const rutaEnv = resolve(RAIZ, env ?? 'apps/edge/.env');

if (!existsSync(rutaEnv)) {
  console.error(`✗ no existe ${rutaEnv}: copie apps/edge/.env.example y rellénelo`);
  process.exit(2);
}

// `pnpm --filter "@ncr/edge..."`: el Edge y lo que importa (domain-core,
// providers), en orden. No por turbo: su caché del Edge no guarda `dist/`
// (turbo.json), y tras un `verificar-etapa` el diagnóstico no existiría.
const compilacion = spawnSync('pnpm', ['--filter', '@ncr/edge...', '--silent', 'run', 'build'], {
  cwd: RAIZ,
  stdio: ['ignore', 'ignore', 'inherit'],
});
if (compilacion.status !== 0) {
  console.error('✗ el Edge no compila: pnpm --filter "@ncr/edge..." run build');
  process.exit(2);
}

const diagnostico = spawnSync(
  process.execPath,
  [`--env-file=${rutaEnv}`, resolve(RAIZ, 'apps/edge/dist/diagnostico-de-sitio.js')],
  { cwd: RAIZ, stdio: 'inherit' },
);
process.exit(diagnostico.status ?? 1);

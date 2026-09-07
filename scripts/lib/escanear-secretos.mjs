#!/usr/bin/env node
/**
 * Escaneo de secretos. Busca VALORES, no nombres: `SUPABASE_SECRET_KEY=` en un
 * `.env.example` es correcto; `SUPABASE_SECRET_KEY=sb_secret_abc` no lo es.
 *
 * ESTÁ EN NODE Y NO EN SHELL A PROPÓSITO (2026-09-07). La versión anterior
 * usaba `xargs -r`, que es una extensión de GNU: en macOS —el entorno de
 * desarrollo objetivo— BSD xargs no la reconoce y el guion fallaba. Como este
 * escaneo corre en el gancho de pre-commit, ese fallo habría bloqueado los
 * commits del usuario.
 *
 * El motivo de fondo va más allá de `-r`: las clases de carácter y los
 * cuantificadores de `grep -E` **no son idénticos** entre BSD y GNU, así que un
 * patrón podía coincidir en Linux y no en macOS —o al revés— sin que nadie lo
 * notara. La expresión regular de Node es la misma en las dos plataformas, y
 * eso es exactamente lo que un control de seguridad necesita.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const PATRONES = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, 'llave secreta de Supabase'],
  [/sb_publishable_[A-Za-z0-9_-]{8,}/, 'llave publicable de Supabase'],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'JSON Web Token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'clave privada'],
  [/(password|passwd|contrasena|contraseña)\s*[:=]\s*['"][^'"<\n]{6,}/i, 'contraseña literal'],
  [/postgres(ql)?:\/\/[^:\s]+:[^@\s<]{6,}@/, 'cadena de conexión con contraseña'],
  [/api_?key\s*[:=]\s*['"][A-Za-z0-9_-]{16,}/i, 'clave de API'],
];

/** El propio escáner contiene los patrones; excluirlo no es una excepción real. */
const EXCLUIDOS = new Set([
  'pnpm-lock.yaml',
  'scripts/lib/escanear-secretos.mjs',
  'scripts/escanear-secretos.sh',
]);

const versionados = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter((f) => f.length > 0 && !EXCLUIDOS.has(f));

const hallazgos = [];
for (const archivo of versionados) {
  let datos;
  try {
    if (statSync(archivo).size > 5_000_000) continue;
    datos = readFileSync(archivo);
  } catch {
    continue; // enlace roto o archivo eliminado del árbol de trabajo
  }
  // Se omiten los binarios igual que hacía `grep -I`: un byte nulo los delata.
  if (datos.includes(0)) continue;

  const lineas = datos.toString('utf8').split('\n');
  lineas.forEach((linea, i) => {
    for (const [patron, descripcion] of PATRONES) {
      if (patron.test(linea)) {
        hallazgos.push(`${archivo}:${i + 1}  ${descripcion}`);
        break;
      }
    }
  });
}

if (hallazgos.length > 0) {
  console.error('POSIBLES SECRETOS EN EL REPOSITORIO:');
  for (const h of hallazgos.slice(0, 20)) console.error(`  ${h}`);
  if (hallazgos.length > 20) console.error(`  … y ${hallazgos.length - 20} más`);
  console.error('\nDetenido: §2.5 prohíbe cualquier secreto en el repositorio.');
  process.exit(1);
}
console.log(`escaneo de secretos: limpio (${versionados.length} archivos)`);

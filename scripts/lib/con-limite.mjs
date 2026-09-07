#!/usr/bin/env node
/**
 * Ejecuta un comando con LÍMITE DE TIEMPO y devuelve su código de salida.
 *
 * `timeout` es de GNU coreutils y macOS no lo trae —allí sería `gtimeout`, y
 * solo con Homebrew—, así que el límite se implementa aquí: se comporta igual
 * en las dos plataformas y no añade dependencias.
 *
 * Motivo (2026-09-07): el paso 10 del verificador se quedaba colgado
 * indefinidamente en macOS. La causa era una sonda que arrancaba la API de
 * verdad —el equipo tenía `.env` completo— y el servidor no termina nunca. La
 * causa se corrigió; el límite queda para que NINGÚN paso pueda volver a
 * dejar el guion sin devolver el control.
 *
 * Uso: node con-limite.mjs <segundos> <comando> [args...]
 * Salida: 124 si venció el plazo, como hace `timeout`.
 */
import { spawn } from 'node:child_process';

const [segundos, comando, ...args] = process.argv.slice(2);
if (!segundos || !comando) {
  console.error('uso: con-limite.mjs <segundos> <comando> [args...]');
  process.exit(2);
}

const hijo = spawn(comando, args, { stdio: 'inherit', shell: false });
let vencido = false;

const reloj = setTimeout(
  () => {
    vencido = true;
    // SIGTERM primero; si no muere en 5 s, SIGKILL. Un proceso que ignora el
    // primero —un servidor a medio cerrar— no puede dejar el guion colgado.
    hijo.kill('SIGTERM');
    setTimeout(() => hijo.kill('SIGKILL'), 5000).unref();
  },
  Number(segundos) * 1000,
);

hijo.on('exit', (codigo, senal) => {
  clearTimeout(reloj);
  if (vencido) {
    console.error(`\n  ✗ el comando superó el límite de ${segundos} s y fue interrumpido`);
    process.exit(124);
  }
  process.exit(codigo ?? (senal ? 1 : 0));
});

hijo.on('error', (e) => {
  clearTimeout(reloj);
  console.error(`  ✗ no se pudo ejecutar "${comando}": ${e.message}`);
  process.exit(127);
});

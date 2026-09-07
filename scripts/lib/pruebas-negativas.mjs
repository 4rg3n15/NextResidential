#!/usr/bin/env node
/**
 * PRUEBAS NEGATIVAS de los propios controles.
 *
 * Un control que nadie ha visto fallar no está demostrado. Aquí se introduce
 * cada violación a propósito, se exige que el control la detecte, y se
 * restaura el estado. Las tres se ejecutaban a mano; ahora corren en el DoD y
 * en CI, que es donde protegen de verdad.
 *
 * Todo cambio se hace sobre ficheros temporales o se revierte en `finally`:
 * una prueba negativa que deje residuos es peor que no tenerla.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.cwd();
let fallos = 0;
const ok = (m) => console.log(`   ✓ ${m}`);
const mal = (m) => {
  console.log(`   ✗ ${m}`);
  fallos += 1;
};

/** Ejecuta un comando y devuelve { codigo, salida } sin lanzar. */
const correr = (cmd, args, opciones = {}) => {
  try {
    const salida = execFileSync(cmd, args, {
      cwd: raiz,
      encoding: 'utf8',
      stdio: 'pipe',
      ...opciones,
    });
    return { codigo: 0, salida };
  } catch (e) {
    return { codigo: e.status ?? 1, salida: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

// ── 1 · un secreto sintético debe detenerse ────────────────────────────────
console.log('\n▸ 1 · un secreto sintético bloquea el escaneo');
{
  const sonda = join(raiz, 'apps', 'api', 'sonda-secreto.tmp.ts');
  try {
    // Valor SINTÉTICO con forma de llave secreta. No es una credencial real y
    // el fichero se borra en `finally`: nunca llega a un commit.
    writeFileSync(sonda, `export const x = 'sb_secret_${'A1b2C3d4E5f6G7h8'}';\n`);
    correr('git', ['add', '--intent-to-add', sonda]);
    const r = correr('node', ['scripts/lib/escanear-secretos.mjs']);
    if (r.codigo !== 0 && /sonda-secreto/.test(r.salida))
      ok('detectado y con salida distinta de cero');
    else mal(`NO detectado (codigo ${r.codigo})`);
  } finally {
    correr('git', ['rm', '--cached', '--quiet', '--force', 'apps/api/sonda-secreto.tmp.ts']);
    rmSync(sonda, { force: true });
  }
  const limpio = correr('node', ['scripts/lib/escanear-secretos.mjs']);
  limpio.codigo === 0 ? ok('el árbol queda limpio tras la sonda') : mal('quedaron residuos');
}

// ── 2 · una construcción divergente rompe el build ─────────────────────────
console.log('\n▸ 2 · una construcción BSD/GNU divergente rompe la verificación');
{
  const sonda = join(raiz, 'scripts', 'sonda-portabilidad.tmp.sh');
  try {
    writeFileSync(sonda, '#!/usr/bin/env bash\necho x | xargs -r echo\n');
    correr('git', ['add', '--intent-to-add', sonda]);
    const r = correr('node', ['scripts/lib/portabilidad.mjs']);
    if (r.codigo !== 0 && /xargs -r/.test(r.salida)) ok('detectada y con salida distinta de cero');
    else mal(`NO detectada (codigo ${r.codigo})`);
  } finally {
    correr('git', ['rm', '--cached', '--quiet', '--force', 'scripts/sonda-portabilidad.tmp.sh']);
    rmSync(sonda, { force: true });
  }
  correr('node', ['scripts/lib/portabilidad.mjs']).codigo === 0
    ? ok('el árbol queda limpio tras la sonda')
    : mal('quedaron residuos');
}

// ── 3 · un fichero de prueba no recogido dispara el control ────────────────
console.log('\n▸ 3 · un fichero de prueba que nadie ejecuta dispara el recuento');
{
  const sonda = join(raiz, 'apps', 'api', 'src', 'sonda-no-recogida.test.ts');
  const salidaFalsa = join(raiz, 'sonda-salida.tmp.txt');
  try {
    mkdirSync(join(raiz, 'apps', 'api', 'src'), { recursive: true });
    writeFileSync(
      sonda,
      "import { it, expect } from 'vitest';\nit('x', () => expect(1).toBe(1));\n",
    );
    // Se simula la salida de una corrida que NO lo recogió: es exactamente el
    // escenario real —un patrón `include` que dejó de alcanzarlo— sin tener que
    // estropear la configuración del repositorio para provocarlo.
    writeFileSync(salidaFalsa, 'Test Files  7 passed (7)\nTests  33 passed (33)\n');
    const r = correr('node', ['scripts/lib/contar-pruebas.mjs', salidaFalsa]);
    if (r.codigo !== 0 && /fueron recogidos/.test(r.salida))
      ok('detectado y con salida distinta de cero');
    else mal(`NO detectado (codigo ${r.codigo}): ${r.salida.trim()}`);
  } finally {
    rmSync(sonda, { force: true });
    rmSync(salidaFalsa, { force: true });
  }
}

// ── 4 · el entorno fuera del rango declarado se detecta ────────────────────
console.log('\n▸ 4 · un Node fuera de `engines` detiene la verificación');
{
  const pkg = join(raiz, 'package.json');
  const original = readFileSync(pkg, 'utf8');
  try {
    const d = JSON.parse(original);
    d.engines.node = '>=99.0.0';
    writeFileSync(pkg, `${JSON.stringify(d, null, 2)}\n`);
    const r = correr('node', ['scripts/lib/verificar-entorno.mjs']);
    r.codigo !== 0 ? ok('detectado') : mal('NO detectado');
  } finally {
    writeFileSync(pkg, original);
  }
  correr('node', ['scripts/lib/verificar-entorno.mjs']).codigo === 0
    ? ok('package.json restaurado')
    : mal('package.json quedó alterado');
}

console.log('');
if (fallos > 0) {
  console.log(`PRUEBAS NEGATIVAS: ${fallos} control(es) NO detectan su violación`);
  process.exit(1);
}
console.log('PRUEBAS NEGATIVAS: los 4 controles detectan su violación');
if (existsSync(join(raiz, 'apps/api/sonda-secreto.tmp.ts'))) process.exit(1);

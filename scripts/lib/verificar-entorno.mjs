#!/usr/bin/env node
/**
 * Comprueba que Node y pnpm locales caen dentro del rango declarado en
 * `engines`, y que coinciden con `.nvmrc` y con la versión que usa el CI.
 *
 * POR QUÉ. Al mover la verificación de shell a Node se cerró una clase de
 * divergencia (BSD contra GNU) y se abrió otra: ahora el resultado depende de
 * la versión de Node. No es lo mismo —el runtime está declarado y es
 * reproducible, mientras que el `xargs` del sistema no— pero solo si alguien lo
 * comprueba. Esto lo comprueba.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const paquete = JSON.parse(readFileSync('package.json', 'utf8'));
const nvmrc = readFileSync('.nvmrc', 'utf8').trim();

const partes = (v) => v.replace(/^v/, '').split('.').map(Number);
const compara = (a, b) => {
  const [x, y] = [partes(a), partes(b)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
};

/** Admite el subconjunto de `engines` que usa este repositorio: `>=A <B`. */
const cumple = (version, rango) => {
  for (const termino of rango.trim().split(/\s+/)) {
    const m = termino.match(/^(>=|<=|<|>|\^|~)?(.+)$/);
    if (!m) continue;
    const [, op = '>=', ref] = m;
    const c = compara(version, ref);
    if (op === '>=' && c < 0) return false;
    if (op === '>' && c <= 0) return false;
    if (op === '<' && c >= 0) return false;
    if (op === '<=' && c > 0) return false;
  }
  return true;
};

const problemas = [];
const nodeLocal = process.versions.node;

if (!cumple(nodeLocal, paquete.engines.node)) {
  problemas.push(`Node ${nodeLocal} queda fuera de engines.node "${paquete.engines.node}"`);
}
if (compara(nodeLocal, nvmrc) !== 0) {
  // Aviso, no error: `.nvmrc` fija la versión exacta del equipo y del CI, pero
  // un parche distinto dentro del rango no invalida una verificación.
  console.warn(
    `  aviso: Node local ${nodeLocal} ≠ .nvmrc ${nvmrc} (dentro del rango; el CI usa .nvmrc)`,
  );
}
if (!cumple(nvmrc, paquete.engines.node)) {
  problemas.push(`.nvmrc ${nvmrc} contradice engines.node "${paquete.engines.node}"`);
}

try {
  const pnpmLocal = execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim();
  if (paquete.engines.pnpm && !cumple(pnpmLocal, paquete.engines.pnpm)) {
    problemas.push(`pnpm ${pnpmLocal} queda fuera de engines.pnpm "${paquete.engines.pnpm}"`);
  }
  const declarado = (paquete.packageManager ?? '').split('@')[1];
  if (declarado && compara(pnpmLocal, declarado) !== 0) {
    problemas.push(`pnpm ${pnpmLocal} ≠ packageManager ${declarado}`);
  }
} catch {
  problemas.push('pnpm no está disponible en el PATH');
}

if (problemas.length > 0) {
  console.error('ENTORNO fuera de lo declarado:');
  for (const p of problemas) console.error(`  ✗ ${p}`);
  console.error('\n  Usa la versión de .nvmrc (`nvm use`) y `corepack enable`.');
  process.exit(1);
}
console.log(`entorno: Node ${nodeLocal} y pnpm dentro de engines · .nvmrc ${nvmrc}`);

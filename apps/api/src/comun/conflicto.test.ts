import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { conflicto } from './conflicto';

/**
 * 15-Z2 · «todo 409 de negocio lleva `codigo`» no se vigila por convicción:
 * se recorre `apps/api/src` y se exige que nadie construya `ConflictException`
 * fuera de `conflicto.ts`. Visto fallar con 36 sitios antes de la ronda.
 */
const RAIZ = join(__dirname, '..');
const ficheros = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return ruta.endsWith('.ts') && !ruta.endsWith('.test.ts') ? [ruta] : [];
  });

describe('conflicto (15-Z2)', () => {
  it('construye el 409 con el texto y el código', () => {
    const e = conflicto('VIVIENDA_CON_TITULAR', 'Esta vivienda ya tiene titular');
    expect(e.getStatus()).toBe(409);
    expect(e.getResponse()).toEqual({
      message: 'Esta vivienda ya tiene titular',
      codigo: 'VIVIENDA_CON_TITULAR',
    });
  });

  it('ningún fichero de apps/api/src construye ConflictException por su cuenta', () => {
    const culpables = ficheros(RAIZ)
      .filter((f) => !f.endsWith(join('comun', 'conflicto.ts')))
      .filter((f) => /new ConflictException\(/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(RAIZ.length + 1));
    expect(culpables).toEqual([]);
  });
});

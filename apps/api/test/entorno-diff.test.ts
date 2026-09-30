import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * O5 (15-N) · `pnpm entorno:diff` AVISA DEL SECRETO OBSOLETO, SIN IMPRIMIRLO
 *
 * `apps/edge/.env` conserva `SUPABASE_SECRET_KEY` aunque el Edge ya no la lee:
 * una llave que nadie usa y que sigue en disco. El comparador la anunciaba como
 * «¿errata?», igual que un nombre mal escrito. Ahora un nombre SECRETO que el
 * `.example` ya no declara es «secreto obsoleto: bórrelo», con énfasis, y el
 * valor sigue sin salir nunca por pantalla.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const GUION = resolve(__dirname, '../../../scripts/lib/comparar-entorno.mjs');
const raiz = mkdtempSync(join(tmpdir(), 'entorno-diff-'));
const VALOR = 'ficticio-valor-que-no-debe-salir-nunca';

const preparar = (ejemplo: string, real: string): void => {
  const dir = join(raiz, 'apps', 'edge');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.env.example'), ejemplo);
  writeFileSync(join(dir, '.env'), real);
};

const correr = (): { codigo: number | null; salida: string } => {
  const r = spawnSync(process.execPath, [GUION, '--raiz', raiz], { encoding: 'utf8' });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
};

afterAll(() => rmSync(raiz, { recursive: true, force: true }));

describe('O5 · secreto obsoleto en un .env local', () => {
  it('lo nombra con énfasis y NO imprime su valor', () => {
    preparar(
      'EDGE_API_URL=https://api.ejemplo.invalid\n',
      `EDGE_API_URL=https://api.ejemplo.invalid\nSUPABASE_SECRET_KEY=${VALOR}\n`,
    );
    const { codigo, salida } = correr();
    expect(salida).toMatch(/SECRETO OBSOLETO: bórrelo/);
    expect(salida).toMatch(/SUPABASE_SECRET_KEY/);
    expect(salida).not.toContain(VALOR);
    expect(salida).not.toContain('valor-que-no-debe');
    expect(codigo).toBe(0);
  });

  it('una variable NO secreta que sobra sigue siendo «¿errata?», no un secreto', () => {
    preparar(
      'EDGE_API_URL=https://api.ejemplo.invalid\n',
      'EDGE_API_URL=https://api.ejemplo.invalid\nEDGE_NOMBER=portal\n',
    );
    const { salida } = correr();
    expect(salida).toMatch(/¿errata\?\): EDGE_NOMBER/);
    expect(salida).not.toMatch(/SECRETO OBSOLETO/);
  });

  it('un secreto que el .example SÍ declara no es obsoleto', () => {
    preparar('SUPABASE_SECRET_KEY=\n', `SUPABASE_SECRET_KEY=${VALOR}\n`);
    const { salida } = correr();
    expect(salida).not.toMatch(/SECRETO OBSOLETO/);
    expect(salida).not.toContain(VALOR);
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nuevaClaveDeIdempotencia } from './clave-de-idempotencia';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Un navegador por IP de LAN en HTTP: `getRandomValues` sí, `randomUUID` no (contexto inseguro). */
const sinContextoSeguro = (): void => {
  vi.stubGlobal('crypto', {
    getRandomValues: <T extends ArrayBufferView>(a: T): T => webcrypto.getRandomValues(a as never),
  });
};

afterEach(() => vi.unstubAllGlobals());

describe('la clave de idempotencia, también fuera de un contexto seguro', () => {
  it('sin randomUUID devuelve un UUID v4 válido (versión 4, variante RFC 4122) y distinto en cada llamada', () => {
    sinContextoSeguro();
    expect(globalThis.crypto.randomUUID).toBeUndefined();
    const claves = Array.from({ length: 200 }, () => nuevaClaveDeIdempotencia());
    for (const c of claves) expect(c).toMatch(UUID_V4);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it('con randomUUID, lo usa', () => {
    const randomUUID = vi.fn(() => '3b241101-e2bb-4255-8caf-4136c566a962');
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: () => undefined });
    expect(nuevaClaveDeIdempotencia()).toBe('3b241101-e2bb-4255-8caf-4136c566a962');
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });

  it('ningún fichero de la consola llama a randomUUID fuera de este helper', () => {
    const raiz = resolve(process.cwd(), 'src');
    const fuera: string[] = [];
    const recorrer = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, e.name);
        if (e.isDirectory()) recorrer(ruta);
        else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
          const rel = relative(raiz, ruta);
          if (rel === join('lib', 'clave-de-idempotencia.ts')) continue;
          if (readFileSync(ruta, 'utf8').includes('randomUUID')) fuera.push(rel);
        }
      }
    };
    recorrer(raiz);
    expect(
      fuera,
      'randomUUID no existe por HTTP en una IP de LAN: use nuevaClaveDeIdempotencia',
    ).toEqual([]);
  });
});

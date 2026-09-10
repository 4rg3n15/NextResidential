import { describe, expect, it } from 'vitest';
import { claseDeAlto, claseDeAncho } from './proporcion';

/**
 * D-63 · las barras que la CSP dejaba a cero.
 *
 * Se dimensionaban con `style={{ height: … }}`, que React sirve como atributo
 * `style="height:37%"`. Con `style-src 'self' 'nonce-…'` el navegador lo
 * rechaza. No lo vio nadie: jsdom no aplica CSP, y el recorrido del navegador
 * visita el tablero sin datos, así que no había barras que pintar.
 */
describe('clases de proporción', () => {
  it('cuantiza al 2 % más cercano', () => {
    expect(claseDeAlto(0)).toBe('alto-0');
    expect(claseDeAlto(37)).toBe('alto-38');
    expect(claseDeAlto(100)).toBe('alto-100');
    expect(claseDeAncho(50)).toBe('ancho-50');
  });

  it('acota fuera de rango en vez de producir una clase inexistente', () => {
    // Un divisor mal calculado daría `alto-240`: una clase que no existe, una
    // barra sin altura, y el mismo fallo silencioso por otro camino.
    expect(claseDeAlto(240)).toBe('alto-100');
    expect(claseDeAlto(-5)).toBe('alto-0');
  });

  it('un valor no finito cae a cero, no a barra llena', () => {
    // `total / maximo` con `maximo === 0` da NaN o Infinity, y sin este caso
    // saldría `alto-NaN` en el marcado. Se cae a 0 y no a 100 a propósito: una
    // barra llena salida de un cálculo roto afirma un dato que no existe;
    // una barra vacía se ve rara y se investiga.
    expect(claseDeAlto(Number.NaN)).toBe('alto-0');
    expect(claseDeAlto(Number.POSITIVE_INFINITY)).toBe('alto-0');
  });

  it('toda clase que se emite existe en globals.css', async () => {
    // El control que ata las dos mitades: la función puede ser correcta y las
    // reglas no estar, y el resultado sería idéntico al defecto original.
    const { existsSync, readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    // La raíz de trabajo depende de si el paquete corre solo o bajo turbo, así
    // que se prueban las dos formas en vez de fijar una y que el control
    // desaparezca en la corrida que no la usa.
    const candidatos = [
      resolve(process.cwd(), 'src/app/globals.css'),
      resolve(process.cwd(), 'apps/web/src/app/globals.css'),
    ];
    const ruta = candidatos.find((c) => existsSync(c));
    expect(ruta, `no se encontró globals.css en ${candidatos.join(' ni ')}`).toBeDefined();
    const css = readFileSync(ruta as string, 'utf8');
    for (let p = 0; p <= 100; p += 1) {
      expect(css).toContain(`.${claseDeAlto(p)} {`);
      expect(css).toContain(`.${claseDeAncho(p)} {`);
    }
  });
});

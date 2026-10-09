import { describe, expect, it } from 'vitest';
import { MedidorDeDuplex } from './medidor-de-duplex';

/**
 * B3 (15-S2) · el semidúplex medido en la conversación: la misma regla que
 * `pnpm sitio:audio` (`juzgarDuplex`), segundo a segundo.
 */
const segundos = (m: MedidorDeDuplex, n: number, subida: number, bajada: number): boolean[] =>
  Array.from({ length: n }, () => {
    m.contarSubida(subida);
    m.contarBajada(bajada);
    return m.tic();
  });

describe('MedidorDeDuplex', () => {
  it('el equipo calla mientras recibe: «semidúplex» una sola vez', () => {
    const m = new MedidorDeDuplex();
    expect(segundos(m, 3, 0, 8000)).toEqual([false, false, false]);
    expect(segundos(m, 3, 8000, 0)).toEqual([false, true, false]);
    expect(segundos(m, 3, 8000, 0)).toEqual([false, false, false]);
  });

  it('dúplex completo: nunca', () => {
    const m = new MedidorDeDuplex();
    expect([...segundos(m, 3, 0, 8000), ...segundos(m, 3, 8000, 8000)]).not.toContain(true);
  });

  it('hacen falta dos segundos de cada clase; un segundo a medias no cuenta', () => {
    const m = new MedidorDeDuplex();
    expect(segundos(m, 1, 0, 8000)).toEqual([false]);
    expect(segundos(m, 1, 8000, 0)).toEqual([false]);
    expect(segundos(m, 1, 1000, 8000)).toEqual([false]);
    expect(segundos(m, 1, 0, 8000)).toEqual([false]);
    expect(segundos(m, 1, 8000, 0)).toEqual([true]);
  });
});

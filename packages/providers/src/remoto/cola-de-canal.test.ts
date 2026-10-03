import { describe, expect, it } from 'vitest';
import { ColaDeCanal } from './cola-de-canal';

/** 15-Q2 · E1 · el canal binario del audio: cierre idempotente y cola con tope. */
const nueva = () => {
  const salidas: number[] = [];
  const cierres: string[] = [];
  const cola = new ColaDeCanal(
    2,
    (c) => salidas.push(...c),
    (m) => cierres.push(m),
  );
  return { cola, salidas, cierres };
};

describe('cola de un canal del túnel (15-Q2)', () => {
  it('cerrar dos veces avisa al otro lado UNA vez; después no sale ni entra nada', async () => {
    const { cola, salidas, cierres } = nueva();
    cola.enviar(new Uint8Array([1]));
    cola.cerrar('fin');
    cola.cerrar('otra vez');
    cola.enviar(new Uint8Array([2]));
    cola.entregar(new Uint8Array([3]));
    expect(salidas).toEqual([1]);
    expect(cierres).toEqual(['fin']);
    expect(cola.cerrado).toBe(true);
    expect(cola.motivoDeCierre).toBe('fin');
    expect(await cola[Symbol.asyncIterator]().next()).toEqual({ value: undefined, done: true });
  });

  it('si nadie lee, se descarta lo más viejo pasado el tope: en vivo, lo viejo no sirve', async () => {
    const { cola } = nueva();
    for (let i = 0; i < 300; i += 1) cola.entregar(new Uint8Array([i % 256]));
    const it = cola[Symbol.asyncIterator]();
    const primero = await it.next();
    expect(primero.done).toBe(false);
    expect([...(primero.value as Uint8Array)]).toEqual([300 - 256]);
  });

  it('el lector que espera recibe lo que llega, y return() cierra el canal', async () => {
    const { cola, cierres } = nueva();
    const it = cola[Symbol.asyncIterator]();
    const espera = it.next();
    cola.entregar(new Uint8Array([7]));
    expect([...((await espera).value as Uint8Array)]).toEqual([7]);
    const fin = it.next();
    cola.terminar('el otro lado cerró');
    cola.terminar('repetido');
    expect((await fin).done).toBe(true);
    expect(cola.motivoDeCierre).toBe('el otro lado cerró');
    await it.return?.();
    expect(cierres).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import * as tokens from './tokens';

describe('tokens de inyección', () => {
  const todos = Object.entries(tokens).filter(([, v]) => typeof v === 'symbol') as [
    string,
    symbol,
  ][];

  it('declara un token por cada puerto del contrato §2.2', () => {
    // 8 de soporte + 9 de repositorio (los nueve agregados) + 4 de proveedor.
    expect(todos).toHaveLength(21);
  });

  it('ningún token colisiona con otro', () => {
    // `Symbol.for` va a un registro GLOBAL: dos claves iguales devolverían el
    // MISMO symbol y una dependencia se inyectaría en el sitio de otra, sin
    // error de compilación. Por eso la unicidad se comprueba, no se supone.
    expect(new Set(todos.map(([, s]) => s)).size).toBe(todos.length);
  });

  it('todas las claves están bajo el prefijo del proyecto', () => {
    for (const [nombre, simbolo] of todos) {
      expect(Symbol.keyFor(simbolo), nombre).toMatch(/^ncr\.puerto\./);
    }
  });
});

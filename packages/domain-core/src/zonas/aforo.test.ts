import { describe, expect, it } from 'vitest';
import { Aforo } from './aforo';
import { esExito, esFallo } from '../compartido/resultado';
import type { Resultado } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';

const abrir = <T>(r: Resultado<T, ErrorDominio>): T => {
  if (!esExito(r)) throw new Error(`dato de prueba inválido: ${r.error.detalle}`);
  return r.valor;
};
const error = <T>(r: Resultado<T, ErrorDominio>): ErrorDominio => {
  if (!esFallo(r)) throw new Error('se esperaba un fallo');
  return r.error;
};

describe('Aforo · construcción', () => {
  it('nace vacío por defecto', () => {
    const a = abrir(Aforo.crear(10));
    expect(a.actual).toBe(0);
    expect(a.disponible).toBe(10);
    expect(a.completo).toBe(false);
  });

  it('rechaza un conteo que ya supera el máximo (RN-14)', () => {
    // Una fila corrupta o una migración a medias no se arrastra: se rechaza.
    expect(error(Aforo.crear(5, 6)).regla).toBe('RN-14');
  });

  it.each([
    ['máximo negativo', -1, 0],
    ['máximo no entero', 1.5, 0],
    ['conteo negativo', 5, -1],
    ['conteo no entero', 5, 1.5],
  ])('rechaza %s', (_caso, maximo, actual) => {
    expect(esFallo(Aforo.crear(maximo, actual))).toBe(true);
  });

  it('un aforo de cero es válido y nace completo', () => {
    // Una zona con aforo 0 está cerrada al aforo, no mal configurada: es cómo
    // se clausura una zona sin tocar su horario.
    const a = abrir(Aforo.crear(0));
    expect(a.completo).toBe(true);
    expect(esFallo(a.ocupar())).toBe(true);
  });

  it('está congelado', () => {
    const a = abrir(Aforo.crear(3));
    expect(() => {
      (a as unknown as Record<string, unknown>).actual = 99;
    }).toThrow();
  });
});

describe('Aforo · el límite exacto y el límite más uno (CA-14)', () => {
  it('se puede ocupar hasta el máximo EXACTO', () => {
    let a = abrir(Aforo.crear(3));
    for (let i = 0; i < 3; i += 1) a = abrir(a.ocupar());
    expect(a.actual).toBe(3);
    expect(a.completo).toBe(true);
    expect(a.disponible).toBe(0);
  });

  it('la ocupación número máximo+1 se rechaza', () => {
    let a = abrir(Aforo.crear(3));
    for (let i = 0; i < 3; i += 1) a = abrir(a.ocupar());
    expect(error(a.ocupar()).regla).toBe('RN-14');
  });

  it('la última plaza libre todavía no está completa', () => {
    let a = abrir(Aforo.crear(3));
    for (let i = 0; i < 2; i += 1) a = abrir(a.ocupar());
    expect(a.completo).toBe(false);
    expect(a.disponible).toBe(1);
  });

  it('ocupar devuelve una instancia nueva y no toca la anterior', () => {
    const a = abrir(Aforo.crear(2));
    const b = abrir(a.ocupar());
    expect(b).not.toBe(a);
    expect(a.actual).toBe(0);
    expect(b.actual).toBe(1);
  });
});

describe('Aforo · liberar y reiniciar', () => {
  it('liberar devuelve una plaza', () => {
    const a = abrir(abrir(Aforo.crear(2)).ocupar());
    expect(a.liberar().actual).toBe(0);
  });

  it('liberar con el contador en cero NO baja de cero (CU-05 6a)', () => {
    // Es el caso real: una salida registrada sin su entrada, por un sensor que
    // falló. Un contador negativo daría plazas de más el resto de la jornada.
    const a = abrir(Aforo.crear(2));
    expect(a.liberar().actual).toBe(0);
    expect(a.liberar()).toBe(a);
  });

  it('liberar desde el máximo deja sitio otra vez', () => {
    let a = abrir(Aforo.crear(1));
    a = abrir(a.ocupar());
    expect(a.completo).toBe(true);
    expect(a.liberar().completo).toBe(false);
  });

  it('reiniciar vacía el contador y conserva el máximo', () => {
    let a = abrir(Aforo.crear(5));
    for (let i = 0; i < 4; i += 1) a = abrir(a.ocupar());
    const r = a.reiniciar();
    expect(r.actual).toBe(0);
    expect(r.maximo).toBe(5);
  });

  it('reiniciar un contador ya vacío devuelve la misma instancia', () => {
    const a = abrir(Aforo.crear(5));
    expect(a.reiniciar()).toBe(a);
  });
});

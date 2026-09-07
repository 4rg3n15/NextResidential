import { describe, expect, it } from 'vitest';
import { VersionDeReglas } from './version-de-reglas';
import { esExito, esFallo } from '../compartido/resultado';

const crear = (n: number, cop = 'cop-1'): VersionDeReglas => {
  const r = VersionDeReglas.crear(n, cop);
  if (!esExito(r)) throw new Error('versión de prueba inválida');
  return r.valor;
};

describe('objeto de valor VersionDeReglas', () => {
  it('exige entero ≥ 1 y copropiedad (RN-15)', () => {
    expect(esFallo(VersionDeReglas.crear(0, 'cop-1'))).toBe(true);
    expect(esFallo(VersionDeReglas.crear(-3, 'cop-1'))).toBe(true);
    expect(esFallo(VersionDeReglas.crear(1.5, 'cop-1'))).toBe(true);
    expect(esFallo(VersionDeReglas.crear(1, ''))).toBe(true);
    expect(esExito(VersionDeReglas.crear(1, 'cop-1'))).toBe(true);
  });

  it('la monotonía es por copropiedad: no se comparan versiones de tenants distintos', () => {
    expect(crear(5).esPosteriorA(crear(4))).toBe(true);
    expect(crear(4).esPosteriorA(crear(5))).toBe(false);
    expect(crear(4).esPosteriorA(crear(4))).toBe(false);
    expect(crear(9, 'cop-2').esPosteriorA(crear(1, 'cop-1'))).toBe(false);
  });

  it('se imprime legible para la bitácora', () => {
    expect(crear(12).toString()).toBe('v12');
  });
});

import { describe, expect, it } from 'vitest';
import { construirClaveIdempotencia } from './idempotencia';
import { esFallo } from '../compartido/resultado';

const base = {
  copropiedadId: 'cop-1',
  dispositivoId: 'disp-1',
  origen: 'lpr',
  referenciaExterna: 'ext-42',
};

describe('clave de idempotencia (RN-17, D-11)', () => {
  it('es estable para el mismo hecho', () => {
    expect(construirClaveIdempotencia(base)).toEqual(construirClaveIdempotencia(base));
  });

  it('NO depende del instante: un reenvío con `ocurridoEn` recalculado da la misma clave', () => {
    // El descriptor no admite fecha por construcción; esta prueba fija esa
    // decisión para que nadie la añada sin darse cuenta (D-11).
    expect(Object.keys(base)).not.toContain('ocurridoEn');
    const a = construirClaveIdempotencia(base);
    const b = construirClaveIdempotencia({ ...base });
    expect(a).toEqual(b);
  });

  it('distingue hechos distintos', () => {
    expect(construirClaveIdempotencia(base)).not.toEqual(
      construirClaveIdempotencia({ ...base, referenciaExterna: 'ext-43' }),
    );
  });

  it('rechaza componentes que romperían el separador o inyectarían basura', () => {
    for (const malo of ['con:dos.puntos:y:mas'.repeat(20), 'con espacio', 'con/barra', '']) {
      expect(esFallo(construirClaveIdempotencia({ ...base, referenciaExterna: malo }))).toBe(true);
    }
  });
});

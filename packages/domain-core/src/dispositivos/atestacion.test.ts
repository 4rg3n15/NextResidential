import { describe, expect, it } from 'vitest';
import { vigenciaDeAtestacion } from './atestacion';

describe('D-11 · vigencia de la atestación del instalador', () => {
  it('mismo firmware (con espacios de más): vigente', () => {
    expect(
      vigenciaDeAtestacion({ firmware: 'V5.3.0 build 220101' }, ' V5.3.0  build 220101 '),
    ).toEqual({ vigente: true, firmware: 'V5.3.0 build 220101' });
  });

  it('otro firmware: sin efecto, y dice cuál y qué hacer', () => {
    const v = vigenciaDeAtestacion({ firmware: 'V5.3.0' }, 'V5.3.2');
    expect(v.vigente).toBe(false);
    if (!v.vigente) expect(v.motivo).toMatch(/V5\.3\.0.*V5\.3\.2.*volver a verificarlo/);
  });

  it('firmware desconocido: no se da por el mismo', () => {
    expect(vigenciaDeAtestacion({ firmware: 'V5.3.0' }, null).vigente).toBe(false);
    expect(vigenciaDeAtestacion({ firmware: 'V5.3.0' }, '  ').vigente).toBe(false);
  });

  it('sin atestación: no vigente', () => {
    expect(vigenciaDeAtestacion(null, 'V5.3.0').vigente).toBe(false);
  });
});

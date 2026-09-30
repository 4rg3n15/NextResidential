import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_POR_OMISION, mezclarPreferencias } from './preferencias-de-atencion';

/** G2 (15-N) · por omisión todo abre y suena; lo guardado sólo apaga lo que nombra. */
describe('mezclarPreferencias', () => {
  it('sin nada guardado, todo activado', () => {
    expect(mezclarPreferencias(null)).toEqual(PREFERENCIAS_POR_OMISION);
    expect(Object.values(PREFERENCIAS_POR_OMISION).every((p) => p.abrir && p.sonar)).toBe(true);
  });

  it('apagar el sonido de la placa no toca nada más', () => {
    const p = mezclarPreferencias({ placa: { sonar: false } });
    expect(p.placa).toEqual({ abrir: true, sonar: false });
    expect(p.llamada).toEqual({ abrir: true, sonar: true });
  });

  it('claves desconocidas y valores que no son booleanos se ignoran', () => {
    const p = mezclarPreferencias({ otra: { abrir: false }, rostro: { abrir: 'no' }, dudoso: 3 });
    expect(p).toEqual(PREFERENCIAS_POR_OMISION);
    expect(Object.keys(p)).not.toContain('otra');
  });
});

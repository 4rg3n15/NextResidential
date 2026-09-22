import { describe, expect, it } from 'vitest';
import { CLAVES_KPI, KPIS, esClaveKpi } from './kpis';

describe('catálogo de KPI', () => {
  it('son exactamente los cinco que el alcance de la ETAPA 14 nombra', () => {
    expect([...CLAVES_KPI]).toEqual(['KPI-09', 'KPI-13', 'KPI-25', 'KPI-32', 'KPI-33']);
  });

  it('cada clave se indexa a sí misma: el mapa no puede desalinearse', () => {
    for (const clave of CLAVES_KPI) expect(KPIS[clave].clave).toBe(clave);
  });

  it('los umbrales son los de los requisitos no funcionales', () => {
    expect(KPIS['KPI-09'].umbralMs).toBe(5_000);
    expect(KPIS['KPI-13'].umbralMs).toBe(3_000);
    expect(KPIS['KPI-25'].umbralMs).toBe(10_000);
    expect(KPIS['KPI-32'].umbralMs).toBe(3_000);
    expect(KPIS['KPI-33'].umbralMs).toBe(2_000);
  });

  it('TODOS declaran qué tramo miden y qué NO incluyen', () => {
    // Es la mitad que hace demostrable una latencia. Una entrada sin `noIncluye`
    // sería una cifra sin contexto, que es exactamente lo que no se quiere.
    for (const clave of CLAVES_KPI) {
      expect(KPIS[clave].segmento.length).toBeGreaterThan(20);
      expect(KPIS[clave].noIncluye.length).toBeGreaterThan(20);
      expect(KPIS[clave].rnf).toMatch(/^RNF-/);
    }
  });

  it('`esClaveKpi` rechaza lo que no es una clave', () => {
    expect(esClaveKpi('KPI-09')).toBe(true);
    expect(esClaveKpi('KPI-19')).toBe(false);
    expect(esClaveKpi(9)).toBe(false);
    expect(esClaveKpi(undefined)).toBe(false);
    expect(esClaveKpi(null)).toBe(false);
  });
});

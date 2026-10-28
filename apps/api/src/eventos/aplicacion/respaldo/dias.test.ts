import { describe, expect, it } from 'vitest';
import { diasAnteriores, diasSinRespaldo, rutaDelRespaldo } from './dias';
import { COP1, HORA_DEL_TRABAJO } from './dobles-del-respaldo';

/**
 * D-147 · el día del respaldo se corta en hora de Bogotá (UTC−5), no en UTC.
 */
describe('días del respaldo', () => {
  it('a las 00:15 de Bogotá del 28, el día a respaldar es el 27, de 05:00 a 05:00 UTC', () => {
    const ayer = diasAnteriores(HORA_DEL_TRABAJO, 1);
    expect(ayer).toHaveLength(1);
    expect(ayer[0]?.fecha).toBe('2026-10-27');
    expect(ayer[0]?.desde.toISOString()).toBe('2026-10-27T05:00:00.000Z');
    expect(ayer[0]?.hasta.toISOString()).toBe('2026-10-28T05:00:00.000Z');
  });

  it('a las 23:30 de Bogotá (04:30 UTC del día siguiente) «ayer» sigue siendo el día anterior en Bogotá', () => {
    const tarde = new Date(Date.UTC(2026, 9, 28, 4, 30)); // 27/10 23:30 en Bogotá
    expect(diasAnteriores(tarde, 1)[0]?.fecha).toBe('2026-10-26');
  });

  it('31 días, del más antiguo al más reciente, contiguos y sin incluir hoy', () => {
    const dias = diasAnteriores(HORA_DEL_TRABAJO);
    expect(dias).toHaveLength(31);
    expect(dias[0]?.fecha).toBe('2026-09-27');
    expect(dias[30]?.fecha).toBe('2026-10-27');
    for (let i = 1; i < dias.length; i += 1) {
      expect(dias[i]?.desde.getTime()).toBe(dias[i - 1]?.hasta.getTime());
    }
  });

  it('cruza el fin de mes y de año', () => {
    const enero = new Date(Date.UTC(2027, 0, 1, 5, 15)); // 01/01/2027 00:15 Bogotá
    expect(diasAnteriores(enero, 2).map((d) => d.fecha)).toEqual(['2026-12-30', '2026-12-31']);
  });

  it('en una zona con horario de verano el día mide lo que mide (23 h)', () => {
    // 09/03/2026 en Nueva York: el 08/03 tuvo 23 horas.
    const lunes = new Date(Date.UTC(2026, 2, 9, 12));
    const [domingo] = diasAnteriores(lunes, 1, 'America/New_York');
    expect(domingo?.fecha).toBe('2026-03-08');
    expect((domingo?.hasta.getTime() ?? 0) - (domingo?.desde.getTime() ?? 0)).toBe(23 * 3600_000);
  });

  it('sólo faltan los días sin respaldo', () => {
    const faltan = diasSinRespaldo(HORA_DEL_TRABAJO, new Set(['2026-10-26', '2026-10-27']), 3);
    expect(faltan.map((d) => d.fecha)).toEqual(['2026-10-25']);
  });

  it('la ruta es la que exige el CHECK de la 0061', () => {
    expect(rutaDelRespaldo(COP1, '2026-10-27')).toBe(`${COP1}/2026/10/eventos-2026-10-27.xls`);
  });
});

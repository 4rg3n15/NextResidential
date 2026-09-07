import { describe, expect, it } from 'vitest';
import { PatronRecurrencia } from './patron-recurrencia';
import { esExito, esFallo } from '../compartido/resultado';

const BOGOTA = -300;
const base = {
  dias: [2],
  minutoInicio: 8 * 60,
  minutoFin: 12 * 60,
  desplazamientoUtcMinutos: BOGOTA,
};
const crear = (p: Partial<typeof base> = {}): PatronRecurrencia => {
  const r = PatronRecurrencia.crear({ ...base, ...p });
  if (!esExito(r)) throw new Error('patrón de prueba inválido');
  return r.valor;
};

describe('objeto de valor PatronRecurrencia (RN-22, CA-06)', () => {
  it('rechaza entradas inválidas', () => {
    expect(esFallo(PatronRecurrencia.crear({ ...base, dias: [] }))).toBe(true);
    expect(esFallo(PatronRecurrencia.crear({ ...base, dias: [7] }))).toBe(true);
    expect(esFallo(PatronRecurrencia.crear({ ...base, dias: [-1] }))).toBe(true);
    expect(esFallo(PatronRecurrencia.crear({ ...base, dias: [1.5] }))).toBe(true);
    expect(esFallo(PatronRecurrencia.crear({ ...base, minutoInicio: -1 }))).toBe(true);
    expect(esFallo(PatronRecurrencia.crear({ ...base, minutoFin: 1441 }))).toBe(true);
    expect(esFallo(PatronRecurrencia.crear({ ...base, minutoFin: 8 * 60 }))).toBe(true);
    expect(esFallo(PatronRecurrencia.crear({ ...base, desplazamientoUtcMinutos: 900 }))).toBe(true);
    expect(esFallo(PatronRecurrencia.crear({ ...base, desplazamientoUtcMinutos: 1.5 }))).toBe(true);
  });

  it('un patrón que cruza la medianoche se expresa con dos, no se admite envolvente', () => {
    const r = PatronRecurrencia.crear({ ...base, minutoInicio: 22 * 60, minutoFin: 2 * 60 });
    expect(esFallo(r)).toBe(true);
  });

  it('deduplica y ordena los días', () => {
    expect(crear({ dias: [5, 1, 5, 3] }).dias).toEqual([1, 3, 5]);
  });

  it('resuelve la hora local de la copropiedad, no la del proceso', () => {
    // 2026-09-08 13:00Z es martes 08:00 en Bogotá: dentro. Y 12:59Z, fuera.
    const p = crear();
    expect(p.aplicaEn(new Date('2026-09-08T13:00:00Z'))).toBe(true);
    expect(p.aplicaEn(new Date('2026-09-08T12:59:00Z'))).toBe(false);
    expect(p.aplicaEn(new Date('2026-09-08T16:59:00Z'))).toBe(true);
    expect(p.aplicaEn(new Date('2026-09-08T17:00:00Z'))).toBe(false); // minutoFin excluido
  });

  it('el día se calcula sobre la hora local: 2026-09-09T02:00Z sigue siendo martes en Bogotá', () => {
    const p = crear({ minutoInicio: 0, minutoFin: 23 * 60 });
    expect(p.aplicaEn(new Date('2026-09-09T02:00:00Z'))).toBe(true); // martes 21:00 local
    expect(p.aplicaEn(new Date('2026-09-09T13:00:00Z'))).toBe(false); // miércoles 08:00 local
  });
});

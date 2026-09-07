import { describe, expect, it } from 'vitest';
import { Vigencia } from './vigencia';
import { esExito, esFallo } from '../compartido/resultado';

const t = (iso: string): Date => new Date(iso);
const crear = (desde: string, hasta: string): Vigencia => {
  const r = Vigencia.crear(t(desde), t(hasta));
  if (!esExito(r)) throw new Error('vigencia de prueba inválida');
  return r.valor;
};

describe('objeto de valor Vigencia', () => {
  it('rechaza fechas no válidas y rangos invertidos (RN-01)', () => {
    expect(esFallo(Vigencia.crear(new Date('no-es-fecha'), t('2026-09-07T10:00:00Z')))).toBe(true);
    expect(esFallo(Vigencia.crear(t('2026-09-07T10:00:00Z'), new Date('no-es-fecha')))).toBe(true);
    expect(esFallo(Vigencia.crear(t('2026-09-07T12:00:00Z'), t('2026-09-07T10:00:00Z')))).toBe(
      true,
    );
    expect(esFallo(Vigencia.crear(t('2026-09-07T10:00:00Z'), t('2026-09-07T10:00:00Z')))).toBe(
      true,
    );
  });

  it('es cerrado-abierto: `hasta` ya está fuera (CA-04)', () => {
    const v = crear('2026-09-07T10:00:00Z', '2026-09-07T12:00:00Z');
    expect(v.contiene(t('2026-09-07T09:59:59Z'))).toBe(false);
    expect(v.contiene(t('2026-09-07T10:00:00Z'))).toBe(true);
    expect(v.contiene(t('2026-09-07T11:59:59Z'))).toBe(true);
    expect(v.contiene(t('2026-09-07T12:00:00Z'))).toBe(false);
  });

  it('dos vigencias consecutivas no se solapan en el instante de corte', () => {
    const a = crear('2026-09-07T10:00:00Z', '2026-09-07T12:00:00Z');
    const b = crear('2026-09-07T12:00:00Z', '2026-09-07T14:00:00Z');
    const corte = t('2026-09-07T12:00:00Z');
    expect([a.contiene(corte), b.contiene(corte)]).toEqual([false, true]);
  });

  it('distingue expirada de aún no empezada', () => {
    const v = crear('2026-09-07T10:00:00Z', '2026-09-07T12:00:00Z');
    expect(v.aunNoEmpiezaEn(t('2026-09-07T09:00:00Z'))).toBe(true);
    expect(v.expiradaEn(t('2026-09-07T09:00:00Z'))).toBe(false);
    expect(v.aunNoEmpiezaEn(t('2026-09-07T13:00:00Z'))).toBe(false);
    expect(v.expiradaEn(t('2026-09-07T13:00:00Z'))).toBe(true);
    expect(v.expiradaEn(t('2026-09-07T12:00:00Z'))).toBe(true);
  });

  it('copia las fechas: mutar la entrada no altera el objeto de valor', () => {
    const desde = t('2026-09-07T10:00:00Z');
    const r = Vigencia.crear(desde, t('2026-09-07T12:00:00Z'));
    if (!esExito(r)) throw new Error('inesperado');
    desde.setUTCFullYear(2030);
    expect(r.valor.desde.getUTCFullYear()).toBe(2026);
  });
});

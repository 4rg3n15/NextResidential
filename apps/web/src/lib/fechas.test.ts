import { describe, expect, it } from 'vitest';
import {
  ahoraLocal,
  fechaCorta,
  fechaYHora,
  horaCorta,
  rangoConFechas,
  rangoDeVisita,
  diaLocalHace,
  rangoDeDias,
} from './fechas';

describe('fechas de la consola · DD-MM-YYYY y rangos con fecha en los dos extremos', () => {
  const inicio = new Date(2026, 8, 29, 14, 5);
  const fin = new Date(2026, 8, 29, 16, 30);

  it('la fecha corta lleva día, mes y año con dos cifras en día y mes', () => {
    expect(fechaCorta(inicio)).toBe('29-09-2026');
    expect(fechaCorta(new Date(2026, 0, 3))).toBe('03-01-2026');
  });

  it('la hora va en 24 horas con dos cifras', () => {
    expect(horaCorta(inicio)).toBe('14:05');
    expect(fechaYHora(fin)).toBe('29-09-2026 16:30');
  });

  it('el rango repite la fecha en los dos extremos aunque sea el mismo día', () => {
    expect(rangoConFechas(inicio, fin)).toBe('29-09-2026 14:05 – 29-09-2026 16:30');
  });

  it('acepta cadenas ISO y no revienta con basura', () => {
    expect(fechaCorta(inicio.toISOString())).toBe('29-09-2026');
    expect(fechaCorta('no es una fecha')).toBe('—');
    expect(rangoConFechas('x', 'y')).toBe('— – —');
  });

  it('precarga un formulario con hoy y la hora local en el formato del navegador', () => {
    expect(ahoraLocal(inicio)).toEqual({ fecha: '2026-09-29', hora: '14:05' });
  });

  it('C5 · el rango de VISITA lleva fecha en los dos extremos y hora de 12 h con a. m./p. m.', () => {
    const desde = new Date(2026, 8, 28, 18, 56);
    const hasta = new Date(2026, 8, 29, 6, 56);
    expect(rangoDeVisita(desde, hasta)).toBe('28-09-2026 06:56 p. m. a 29-09-2026 06:56 a. m.');
    expect(rangoDeVisita(new Date(2026, 8, 29, 0, 5), new Date(2026, 8, 29, 12, 0))).toBe(
      '29-09-2026 12:05 a. m. a 29-09-2026 12:00 p. m.',
    );
    expect(rangoDeVisita('x', hasta)).toBe('—');
  });
});

describe('otros fallos (15-M) · días locales y rango de filtro', () => {
  it('«hace N días» es la fecha LOCAL, también de noche en Colombia', () => {
    // 29-09 a las 20:00 locales: en UTC ya es el 30.
    const noche = new Date(2026, 8, 29, 20, 0);
    expect(diaLocalHace(0, noche)).toBe('2026-09-29');
    expect(diaLocalHace(7, noche)).toBe('2026-09-22');
  });

  it('un rango válido pide hasta el día siguiente, exclusivo', () => {
    const r = rangoDeDias('2026-09-22', '2026-09-29');
    expect(r?.desde).toBe(new Date(2026, 8, 22).toISOString());
    expect(r?.hasta).toBe(new Date(2026, 8, 30).toISOString());
  });

  it('vacío, incompleto o al revés: null, nunca una excepción', () => {
    expect(rangoDeDias('', '2026-09-29')).toBeNull();
    expect(rangoDeDias('2026-09-2', '2026-09-29')).toBeNull();
    expect(rangoDeDias('2026-09-30', '2026-09-29')).toBeNull();
  });
});

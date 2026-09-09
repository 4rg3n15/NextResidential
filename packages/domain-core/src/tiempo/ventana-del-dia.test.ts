import { describe, expect, it } from 'vitest';
import { esZonaHorariaValida, horaLocal, ventanaDelDia } from './ventana-del-dia';

/**
 * La ventana del día es la que decide qué cuenta como «visitantes hoy». Un
 * error aquí no rompe nada: solo devuelve un número equivocado, que es la clase
 * de defecto que nadie encuentra mirando la pantalla.
 */
describe('ventanaDelDia', () => {
  it('en Bogotá (UTC-5, sin horario de verano) el día empieza a las 05:00 UTC', () => {
    // 2026-09-09 02:00 UTC = 2026-09-08 21:00 en Bogotá: es el día ANTERIOR.
    const v = ventanaDelDia(new Date('2026-09-09T02:00:00Z'), 'America/Bogota');
    expect(v.desde.toISOString()).toBe('2026-09-08T05:00:00.000Z');
    expect(v.hasta.toISOString()).toBe('2026-09-09T05:00:00.000Z');
  });

  it('la zona del servidor no influye: UTC y Bogotá dan ventanas distintas', () => {
    const instante = new Date('2026-09-09T02:00:00Z');
    const bogota = ventanaDelDia(instante, 'America/Bogota');
    const utc = ventanaDelDia(instante, 'UTC');
    expect(utc.desde.toISOString()).toBe('2026-09-09T00:00:00.000Z');
    expect(bogota.desde.getTime()).not.toBe(utc.desde.getTime());
  });

  it('la ventana contiene el instante y dura menos de 26 horas', () => {
    for (const zona of ['America/Bogota', 'UTC', 'Europe/Madrid', 'Pacific/Chatham']) {
      const ahora = new Date('2026-03-29T08:30:00Z');
      const v = ventanaDelDia(ahora, zona);
      expect(v.desde.getTime(), zona).toBeLessThanOrEqual(ahora.getTime());
      expect(v.hasta.getTime(), zona).toBeGreaterThan(ahora.getTime());
      const horas = (v.hasta.getTime() - v.desde.getTime()) / 3_600_000;
      expect(horas, zona).toBeGreaterThanOrEqual(22);
      expect(horas, zona).toBeLessThanOrEqual(26);
    }
  });

  it('el día del cambio de horario dura 23 horas y el de vuelta 25 (Madrid)', () => {
    // 2026-03-29: España adelanta el reloj. Ese día tiene 23 horas.
    const adelanto = ventanaDelDia(new Date('2026-03-29T10:00:00Z'), 'Europe/Madrid');
    expect((adelanto.hasta.getTime() - adelanto.desde.getTime()) / 3_600_000).toBe(23);
    // 2026-10-25: lo atrasa. Ese día tiene 25.
    const atraso = ventanaDelDia(new Date('2026-10-25T10:00:00Z'), 'Europe/Madrid');
    expect((atraso.hasta.getTime() - atraso.desde.getTime()) / 3_600_000).toBe(25);
  });

  it('el minuto exacto de la medianoche local pertenece al día que empieza', () => {
    const v = ventanaDelDia(new Date('2026-09-08T05:00:00Z'), 'America/Bogota');
    expect(v.desde.toISOString()).toBe('2026-09-08T05:00:00.000Z');
  });

  it('el último milisegundo del día local sigue dentro de la ventana', () => {
    const v = ventanaDelDia(new Date('2026-09-09T04:59:59.999Z'), 'America/Bogota');
    expect(v.hasta.toISOString()).toBe('2026-09-09T05:00:00.000Z');
  });
});

describe('horaLocal', () => {
  it('agrupa por la hora de la copropiedad, no por la del proceso', () => {
    expect(horaLocal(new Date('2026-09-09T13:20:00Z'), 'America/Bogota')).toBe(8);
    expect(horaLocal(new Date('2026-09-09T13:20:00Z'), 'UTC')).toBe(13);
  });

  it('la medianoche local es la hora 0 y no la 24', () => {
    expect(horaLocal(new Date('2026-09-09T05:00:00Z'), 'America/Bogota')).toBe(0);
  });
});

describe('esZonaHorariaValida', () => {
  it('acepta las zonas IANA que el esquema admite', () => {
    expect(esZonaHorariaValida('America/Bogota')).toBe(true);
    expect(esZonaHorariaValida('UTC')).toBe(true);
  });

  it('rechaza lo que no es una zona, en vez de lanzar en mitad de la consulta', () => {
    expect(esZonaHorariaValida('Marte/Olympus')).toBe(false);
    expect(esZonaHorariaValida('')).toBe(false);
  });
});

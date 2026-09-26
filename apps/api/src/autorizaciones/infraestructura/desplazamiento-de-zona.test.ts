import { describe, expect, it } from 'vitest';
import { desplazamientoDeZona } from './desplazamiento-de-zona';

/**
 * H-15I-05 · el desplazamiento sale de la zona IANA y del INSTANTE, no del
 * proceso. Los casos con horario de verano son los que un «−300 fijo» o un
 * `getTimezoneOffset()` del servidor habrían resuelto mal.
 */
describe('desplazamientoDeZona', () => {
  it('Bogotá es −300 todo el año', () => {
    expect(desplazamientoDeZona('America/Bogota', new Date('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(desplazamientoDeZona('America/Bogota', new Date('2026-07-15T12:00:00Z'))).toBe(-300);
  });

  it('con horario de verano, depende de la FECHA del instante', () => {
    expect(desplazamientoDeZona('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(-300);
    expect(desplazamientoDeZona('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe(-240);
    expect(desplazamientoDeZona('Europe/Madrid', new Date('2026-07-15T12:00:00Z'))).toBe(120);
  });

  it('medias horas y el lado positivo de UTC', () => {
    expect(desplazamientoDeZona('Asia/Kolkata', new Date('2026-03-01T00:00:00Z'))).toBe(330);
    expect(desplazamientoDeZona('UTC', new Date('2026-03-01T23:59:59Z'))).toBe(0);
  });

  it('cerca de la medianoche local no confunde el día: −300 a las 00:30 UTC', () => {
    expect(desplazamientoDeZona('America/Bogota', new Date('2026-09-29T00:30:00Z'))).toBe(-300);
  });

  it('una zona que no existe, o un instante inválido, no se inventan: null', () => {
    expect(desplazamientoDeZona('Marte/Olympus_Mons', new Date('2026-03-01T00:00:00Z'))).toBeNull();
    expect(desplazamientoDeZona('America/Bogota', new Date(Number.NaN))).toBeNull();
  });
});

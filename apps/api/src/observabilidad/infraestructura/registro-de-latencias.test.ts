import { describe, expect, it } from 'vitest';
import type { Reloj } from '@ncr/domain-core';
import { RegistroDeLatencias } from './registro-de-latencias';

const relojFijo = (iso: string): Reloj => ({ ahora: () => new Date(iso) });
const fila = (r: RegistroDeLatencias, clave: string) =>
  r.resumen().filas.find((f) => f.definicion.clave === clave)!;

describe('RegistroDeLatencias', () => {
  it('sin muestras, `cumple` es null y no false', () => {
    const r = new RegistroDeLatencias(relojFijo('2026-09-22T10:00:00Z'));
    for (const f of r.resumen().filas) {
      expect(f.cumple).toBeNull();
      expect(f.muestras).toBe(0);
      expect(f.observadas).toBe(0);
    }
  });

  it('el instante de arranque sale del reloj INYECTADO', () => {
    const r = new RegistroDeLatencias(relojFijo('2026-09-22T10:00:00Z'));
    expect(r.resumen().desde).toBe('2026-09-22T10:00:00.000Z');
    expect(r.inicio.toISOString()).toBe('2026-09-22T10:00:00.000Z');
  });

  it('cuenta los incumplimientos contra el umbral del indicador', () => {
    const r = new RegistroDeLatencias(relojFijo('2026-09-22T10:00:00Z'));
    r.observar('KPI-32', 2_999); // por debajo del techo de 3 000
    r.observar('KPI-32', 3_000); // justo en el techo NO incumple
    r.observar('KPI-32', 3_001); // uno más y sí
    const f = fila(r, 'KPI-32');
    expect(f.observadas).toBe(3);
    expect(f.incumplimientos).toBe(1);
    expect(f.maximo).toBe(3_001);
  });

  it('`cumple` se juzga por el p95, no por el máximo', () => {
    const r = new RegistroDeLatencias(relojFijo('2026-09-22T10:00:00Z'));
    for (let i = 0; i < 99; i += 1) r.observar('KPI-33', 100);
    r.observar('KPI-33', 60_000); // una atroz entre cien
    const f = fila(r, 'KPI-33');
    expect(f.p95).toBe(100);
    expect(f.cumple).toBe(true);
    // …y aun así el incumplimiento queda registrado, que es lo que impide
    // leer «cumple» como «no pasó nada».
    expect(f.incumplimientos).toBe(1);
    expect(f.maximo).toBe(60_000);
  });

  it('el anillo descarta la MÁS ANTIGUA y no una cualquiera', () => {
    const r = new RegistroDeLatencias(relojFijo('2026-09-22T10:00:00Z'), 4);
    for (const ms of [1, 2, 3, 4]) r.observar('KPI-09', ms);
    r.observar('KPI-09', 5);
    const f = fila(r, 'KPI-09');
    expect(f.muestras).toBe(4);
    expect(f.maximo).toBe(5);
    // el 1 se fue; el mínimo que queda es el 2
    expect(f.p50).toBeGreaterThanOrEqual(3);
  });

  it('los contadores desde el arranque SOBREVIVEN al anillo', () => {
    // Es el punto entero de que vivan fuera: una ráfaga de tráfico sano no
    // puede borrar el rastro de los incumplimientos de hace una hora.
    const r = new RegistroDeLatencias(relojFijo('2026-09-22T10:00:00Z'), 4);
    r.observar('KPI-09', 99_000);
    for (let i = 0; i < 40; i += 1) r.observar('KPI-09', 10);
    const f = fila(r, 'KPI-09');
    expect(f.muestras).toBe(4);
    expect(f.observadas).toBe(41);
    expect(f.incumplimientos).toBe(1);
  });

  it('descarta lo que no es una latencia en vez de envenenar el percentil', () => {
    const r = new RegistroDeLatencias(relojFijo('2026-09-22T10:00:00Z'));
    r.observar('KPI-13', -3);
    r.observar('KPI-13', Number.NaN);
    r.observar('KPI-13', Number.POSITIVE_INFINITY);
    expect(fila(r, 'KPI-13').observadas).toBe(0);
    r.observar('KPI-13', 0); // cero SÍ es una latencia válida
    expect(fila(r, 'KPI-13').observadas).toBe(1);
  });

  it('cada indicador lleva su propio anillo', () => {
    const r = new RegistroDeLatencias(relojFijo('2026-09-22T10:00:00Z'));
    r.observar('KPI-09', 10);
    expect(fila(r, 'KPI-09').observadas).toBe(1);
    expect(fila(r, 'KPI-13').observadas).toBe(0);
  });

  it('reiniciar deja los cinco a cero', () => {
    const r = new RegistroDeLatencias(relojFijo('2026-09-22T10:00:00Z'));
    r.observar('KPI-25', 11_000);
    r.reiniciar();
    for (const f of r.resumen().filas) {
      expect(f.observadas).toBe(0);
      expect(f.incumplimientos).toBe(0);
    }
  });

  it('el resumen trae el tramo medido junto a la cifra', () => {
    const r = new RegistroDeLatencias(relojFijo('2026-09-22T10:00:00Z'));
    const f = fila(r, 'KPI-13');
    expect(f.definicion.noIncluye).toMatch(/FÍSICOS/);
    expect(r.resumen().ventana).toBe(2048);
  });
});

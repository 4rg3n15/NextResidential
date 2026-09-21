import { describe, expect, it } from 'vitest';
import { enlaceInicial, minutosSinContacto, registrarSonda } from './enlace-wan';
import type { EstadoDelEnlace } from './enlace-wan';

const UMBRALES = { sondasParaCaer: 3, sondasParaVolver: 2 };
const T = (m: number) => new Date(Date.UTC(2026, 8, 21, 10, m));

const secuencia = (sondas: readonly boolean[]): EstadoDelEnlace =>
  sondas.reduce<EstadoDelEnlace>(
    (estado, correcta, i) => registrarSonda(estado, { correcta, ahora: T(i) }, UMBRALES),
    enlaceInicial(),
  );

describe('enlace WAN · histéresis', () => {
  it('arranca AUTÓNOMO, no en línea', () => {
    // Suponer nube al encender haría que cada acceso esperara un tiempo de
    // espera de red hasta que la primera sonda fallara.
    expect(enlaceInicial().modo).toBe('autonomo');
  });

  it('dos sondas correctas lo ponen en línea', () => {
    expect(secuencia([true, true]).modo).toBe('en_linea');
  });

  it('UNA sonda fallida NO lo saca de línea: eso es el punto de la histéresis', () => {
    // Sin esto, un paquete perdido conmutaría el modo, y cada conmutación
    // arrastra trabajo real: vaciar bandeja, recargar reglas, registrar.
    expect(secuencia([true, true, false]).modo).toBe('en_linea');
    expect(secuencia([true, true, false, false]).modo).toBe('en_linea');
  });

  it('tres fallidas SEGUIDAS sí', () => {
    expect(secuencia([true, true, false, false, false]).modo).toBe('autonomo');
  });

  it('el contador se reinicia con una correcta por medio', () => {
    // Fallo, fallo, acierto, fallo, fallo: cinco sondas, ninguna racha de tres.
    expect(secuencia([true, true, false, false, true, false, false]).modo).toBe('en_linea');
  });

  it('volver cuesta menos que caer, y es deliberado', () => {
    // Caer deja de intentar la nube: se exige más evidencia. Volver es barato y
    // reversible: se exige menos.
    const caido = secuencia([true, true, false, false, false]);
    const unaCorrecta = registrarSonda(caido, { correcta: true, ahora: T(9) }, UMBRALES);
    expect(unaCorrecta.modo).toBe('autonomo');
    const dos = registrarSonda(unaCorrecta, { correcta: true, ahora: T(10) }, UMBRALES);
    expect(dos.modo).toBe('en_linea');
  });

  it('el último contacto solo avanza con sondas correctas', () => {
    const estado = secuencia([true, true, false, false]);
    expect(estado.ultimoContacto).toEqual(T(1));
    expect(minutosSinContacto(estado, T(61))).toBe(60);
  });
});

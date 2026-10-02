import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BYTES_POR_TRAMA,
  DetectorDeMarcas,
  FuenteDeTramas,
  codificarUlaw,
  decodificarUlaw,
  nivelUlaw,
  tramaDeSilencio,
  tramaDeTono,
} from './marcas-de-audio';

describe('15-P · P1 · tramas µ-law y marcas para medir el audio', () => {
  afterEach(() => vi.useRealTimers());

  it('el silencio es 0xFF y el µ-law ida y vuelta conserva el signo y el orden de magnitud', () => {
    expect(tramaDeSilencio()).toHaveLength(BYTES_POR_TRAMA);
    expect([...tramaDeSilencio()].every((b) => b === 0xff)).toBe(true);
    for (const m of [-30_000, -1000, 0, 1000, 30_000]) {
      const vuelta = decodificarUlaw(codificarUlaw(m));
      expect(Math.sign(vuelta)).toBe(Math.sign(m));
      expect(Math.abs(vuelta - m)).toBeLessThanOrEqual(Math.max(16, Math.abs(m) * 0.07));
    }
  });

  it('un tono tiene nivel; el silencio, no', () => {
    expect(nivelUlaw(tramaDeTono(0))).toBeGreaterThan(4000);
    expect(nivelUlaw(tramaDeSilencio())).toBe(0);
    expect(nivelUlaw(new Uint8Array(0))).toBe(0);
  });

  it('el detector da el instante del trozo que trae el tono, aunque llegue partido', () => {
    let reloj = 1000;
    const instantes: number[] = [];
    const detector = new DetectorDeMarcas(
      (t) => instantes.push(t),
      () => reloj,
    );
    detector.alimentar(tramaDeSilencio());
    reloj = 1020;
    const tono = tramaDeTono(0);
    detector.alimentar(tono.subarray(0, 50));
    reloj = 1025;
    detector.alimentar(tono.subarray(50));
    // Sigue el tono: no es otra marca.
    reloj = 1040;
    detector.alimentar(tramaDeTono(1));
    expect(instantes).toEqual([1025]);
  });

  it('tras 50 ms de silencio se rearma y cuenta la marca siguiente', () => {
    let reloj = 0;
    const instantes: number[] = [];
    const detector = new DetectorDeMarcas(
      (t) => instantes.push(t),
      () => reloj,
    );
    detector.alimentar(tramaDeTono(0));
    reloj = 100;
    detector.alimentar(tramaDeSilencio());
    reloj = 120;
    detector.alimentar(tramaDeTono(1));
    expect(instantes).toEqual([0]);
    reloj = 200;
    for (let i = 0; i < 3; i += 1) detector.alimentar(tramaDeSilencio());
    reloj = 260;
    detector.alimentar(tramaDeTono(2));
    expect(instantes).toEqual([0, 260]);
  });

  it('la fuente emite cada 20 ms, apunta cuándo sale el tono y se para sin oyentes', () => {
    vi.useFakeTimers();
    const recibidas: Uint8Array[] = [];
    const fuente = new FuenteDeTramas(2, () => Date.now());
    const soltar = fuente.suscribir((t) => recibidas.push(t));
    vi.advanceTimersByTime(40);
    fuente.marcar();
    vi.advanceTimersByTime(80);
    expect(recibidas).toHaveLength(6);
    expect(recibidas.map((t) => nivelUlaw(t) > 0)).toEqual([
      false,
      false,
      true,
      true,
      false,
      false,
    ]);
    expect(fuente.marcasEmitidas).toHaveLength(1);
    soltar();
    vi.advanceTimersByTime(100);
    expect(recibidas).toHaveLength(6);
  });
});

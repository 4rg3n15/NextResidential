import { describe, expect, it, vi } from 'vitest';
import { BYTES_POR_TROZO, reproducirFlujo, trocear } from './puente';

/**
 * Lo que se puede probar sin navegador: el troceado del micrófono y que la
 * reproducción decodifique y PROGRAME cada trozo a continuación del anterior
 * sobre un `AudioContext` de mentira. Lo que no: que suene. Eso se mide en
 * sitio (KPI-33), y el informe lo dice así.
 */
describe('trocear', () => {
  it('junta lo pendiente con lo nuevo y entrega trozos completos, dejando el resto', () => {
    const { trozos, resto } = trocear(new Uint8Array([1, 2]), new Uint8Array([3, 4, 5, 6, 7]), 3);
    expect(trozos.map((t) => [...t])).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect([...resto]).toEqual([7]);
  });

  it('por omisión el trozo son ~200 ms de G.711 a 8 kHz', () => {
    expect(BYTES_POR_TROZO).toBe(1600);
  });
});

const contextoFalso = () => {
  const programados: { largo: number; en: number }[] = [];
  const contexto = {
    currentTime: 0,
    destination: {},
    createBuffer: (_c: number, largo: number, hz: number) => ({
      duration: largo / hz,
      copyToChannel: () => undefined,
    }),
    createBufferSource: () => {
      const fuente = {
        buffer: null as { duration: number } | null,
        connect: () => undefined,
        start: (en: number) => programados.push({ largo: fuente.buffer?.duration ?? 0, en }),
      };
      return fuente;
    },
    close: vi.fn(async () => undefined),
  };
  return { contexto: contexto as unknown as AudioContext, programados };
};

const flujoDe = (trozos: Uint8Array[]): Response => {
  let i = 0;
  const cuerpo = new ReadableStream<Uint8Array>({
    pull: (c) => {
      const t = trozos[i];
      i += 1;
      if (t === undefined) c.close();
      else c.enqueue(t);
    },
  });
  return new Response(cuerpo, { status: 200 });
};

describe('reproducirFlujo', () => {
  it('programa cada trozo a continuación del anterior y cierra el contexto al acabar', async () => {
    const { contexto, programados } = contextoFalso();
    const terminado = new Promise<string>((listo) => {
      void reproducirFlujo('/audio', 'g711u', {
        crearContexto: () => contexto,
        pedir: async () => flujoDe([new Uint8Array(160).fill(0xff), new Uint8Array(80).fill(0xff)]),
        alTerminar: listo,
      });
    });
    expect(await terminado).toBe('fin');
    expect(programados).toHaveLength(2);
    expect(programados[0]?.largo).toBeCloseTo(0.02, 5);
    // El segundo empieza donde acaba el primero: sin huecos ni solapes.
    expect(programados[1]?.en).toBeCloseTo((programados[0]?.en ?? 0) + 0.02, 5);
    expect(contexto.close).toHaveBeenCalled();
  });

  it('una respuesta que no es 200 no abre nada y lo dice', async () => {
    const { contexto } = contextoFalso();
    await expect(
      reproducirFlujo('/audio', 'g711u', {
        crearContexto: () => contexto,
        pedir: async () => new Response(null, { status: 409 }),
      }),
    ).rejects.toThrow(/HTTP 409/);
    expect(contexto.close).toHaveBeenCalled();
  });

  it('detener corta el flujo y avisa «detenido»', async () => {
    const { contexto } = contextoFalso();
    const nunca = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) });
    const motivo = new Promise<string>((listo) => {
      void reproducirFlujo('/audio', 'g711u', {
        crearContexto: () => contexto,
        pedir: async () => new Response(nunca, { status: 200 }),
        alTerminar: listo,
      }).then((control) => control.detener());
    });
    expect(await motivo).toBe('detenido');
  });
});

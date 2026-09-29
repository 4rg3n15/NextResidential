import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { PLAZO_DE_CIERRE_MS, instalarCierreOrdenado } from './cierre-ordenado';
import type { CerrablePorSenal } from './cierre-ordenado';

/**
 * Otros fallos (15-M) · Ctrl+C dejaba la API colgada: `app.close()` esperaba
 * al servidor HTTP y las conexiones SSE de la consola no terminan nunca.
 */
const montar = (close: () => Promise<void>, plazoMs?: number) => {
  const oyentes = new Map<string, () => void>();
  const lineas: string[] = [];
  const bitacora: Bitacora = { registrar: (_n, m) => void lineas.push(m) };
  const salir = vi.fn<(codigo: number) => void>();
  const cortar = vi.fn();
  const app: CerrablePorSenal = {
    close: vi.fn(close),
    getHttpServer: () => ({ closeAllConnections: cortar }),
  };
  const alRecibir = instalarCierreOrdenado(app, bitacora, {
    salir,
    ...(plazoMs === undefined ? {} : { plazoMs }),
    proceso: { on: ((senal: string, f: () => void) => oyentes.set(senal, f)) as never },
  });
  return { app, alRecibir, oyentes, lineas, salir, cortar };
};

afterEach(() => {
  vi.useRealTimers();
});

describe('instalarCierreOrdenado', () => {
  it('escucha SIGINT y SIGTERM; el plazo por omisión son 10 s', () => {
    const { oyentes } = montar(async () => undefined);
    expect([...oyentes.keys()].sort()).toEqual(['SIGINT', 'SIGTERM']);
    expect(PLAZO_DE_CIERRE_MS).toBe(10_000);
  });

  it('primera señal: corta las conexiones abiertas ANTES de cerrar y sale con 0', async () => {
    const orden: string[] = [];
    const { app, alRecibir, salir, cortar, lineas } = montar(async () => {
      orden.push('close');
    });
    cortar.mockImplementation(() => orden.push('cortar'));

    await alRecibir('SIGINT');

    expect(orden).toEqual(['cortar', 'close']);
    expect(app.close).toHaveBeenCalledTimes(1);
    expect(salir).toHaveBeenCalledWith(0);
    expect(lineas).toContain('cerrando la API');
  });

  it('si el cierre falla, sale con 1 y lo dice', async () => {
    const { alRecibir, salir, lineas } = montar(async () => {
      throw new Error('pool');
    });
    await alRecibir('SIGTERM');
    expect(salir).toHaveBeenCalledWith(1);
    expect(lineas).toContain('fallo al cerrar la API');
  });

  it('si el cierre se cuelga, al vencer el plazo sale igual con 1', async () => {
    vi.useFakeTimers();
    const { alRecibir, salir, lineas } = montar(() => new Promise<void>(() => undefined), 500);
    void alRecibir('SIGINT');
    await vi.advanceTimersByTimeAsync(499);
    expect(salir).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(salir).toHaveBeenCalledWith(1);
    expect(lineas).toContain('el cierre no terminó a tiempo: se sale igual');
  });

  it('una segunda señal sale en el acto con 130, sin volver a cerrar', async () => {
    const { app, alRecibir, salir } = montar(() => new Promise<void>(() => undefined));
    void alRecibir('SIGINT');
    await alRecibir('SIGINT');
    expect(salir).toHaveBeenCalledWith(130);
    expect(app.close).toHaveBeenCalledTimes(1);
  });

  it('las señales del proceso llegan al mismo manejador', async () => {
    const { oyentes, salir } = montar(async () => undefined);
    oyentes.get('SIGTERM')?.();
    await vi.waitFor(() => expect(salir).toHaveBeenCalledWith(0));
  });
});

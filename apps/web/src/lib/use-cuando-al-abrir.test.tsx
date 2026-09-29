import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCuandoAlAbrir } from './use-cuando-al-abrir';

/**
 * Otros fallos (15-M) · la pantalla de visitantes se abre a las 07:00 y la
 * visita se registra a las 10:30: el formulario tiene que proponer las 10:30.
 */
afterEach(() => {
  vi.useRealTimers();
});

describe('useCuandoAlAbrir', () => {
  it('propone la hora de ABRIR el formulario, no la de montar la pantalla', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 7, 0));
    const { result, rerender } = renderHook(({ abierto }) => useCuandoAlAbrir(abierto), {
      initialProps: { abierto: false },
    });
    expect(result.current.hora).toBe('07:00');

    vi.setSystemTime(new Date(2026, 8, 29, 10, 30));
    rerender({ abierto: true });
    expect(result.current.fecha).toBe('2026-09-29');
    expect(result.current.hora).toBe('10:30');
  });

  it('«registrar otra» sin cerrar vuelve a proponer la hora de ahora', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 10, 30));
    const { result } = renderHook(() => useCuandoAlAbrir(true));
    act(() => result.current.setHora('09:00'));
    vi.setSystemTime(new Date(2026, 8, 29, 11, 15));
    act(() => result.current.reponer());
    expect(result.current.hora).toBe('11:15');
  });
});

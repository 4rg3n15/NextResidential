import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ControlDeAudio } from '@/lib/audio/puente';

/**
 * Otros fallos (15-M) · el micrófono no puede quedar transmitiendo al
 * videoportero cuando el operador ya soltó «Mantener para hablar».
 *
 * `getUserMedia` tarda —la primera vez, lo que tarde la persona en conceder el
 * permiso—. Antes, la captura se guardaba DESPUÉS de esa espera: un clic corto
 * soltaba el botón con la captura aún en `null`, y al abrir el micrófono nadie
 * lo cerraba.
 */
const pendientes: ((control: ControlDeAudio) => void)[] = [];
const detener = vi.fn();
const capturar = vi.fn(
  () =>
    new Promise<ControlDeAudio>((resolver) => {
      pendientes.push(resolver);
    }),
);

vi.mock('@/lib/audio/puente', () => ({
  reproducirFlujo: vi.fn(async () => ({ detener: vi.fn() })),
  capturarMicrofono: (...args: unknown[]) => capturar(...(args as [])),
}));

const { ControlesDeAudio } = await import('./controles-de-audio');

const boton = (): HTMLElement => screen.getByRole('button', { name: /hablar|hablando/i });

afterEach(cleanup);

beforeEach(() => {
  pendientes.splice(0);
  detener.mockClear();
  capturar.mockClear();
});

describe('ControlesDeAudio · el botón de hablar (otros fallos, 15-M)', () => {
  const montar = () =>
    render(<ControlesDeAudio copropiedadId="c" dispositivoId="d" formatoAnunciado="G.711ulaw" />);

  it('soltado antes de que abra el micrófono: al abrir se cierra en el acto', async () => {
    montar();
    fireEvent.mouseDown(boton());
    fireEvent.mouseUp(boton());
    await act(async () => {
      pendientes[0]?.({ detener });
    });
    expect(detener).toHaveBeenCalledTimes(1);
    expect(boton().getAttribute('aria-pressed')).toBe('false');
  });

  it('mantenido: transmite hasta soltar, y soltar lo cierra', async () => {
    montar();
    fireEvent.mouseDown(boton());
    await act(async () => {
      pendientes[0]?.({ detener });
    });
    expect(boton().getAttribute('aria-pressed')).toBe('true');
    expect(detener).not.toHaveBeenCalled();
    fireEvent.mouseUp(boton());
    expect(detener).toHaveBeenCalledTimes(1);
  });

  it('la autorrepetición del teclado no abre varias capturas', async () => {
    montar();
    fireEvent.keyDown(boton(), { key: ' ' });
    fireEvent.keyDown(boton(), { key: ' ' });
    fireEvent.keyDown(boton(), { key: ' ' });
    expect(capturar).toHaveBeenCalledTimes(1);
    fireEvent.keyUp(boton(), { key: ' ' });
    await act(async () => {
      pendientes[0]?.({ detener });
    });
    expect(detener).toHaveBeenCalledTimes(1);
  });
});

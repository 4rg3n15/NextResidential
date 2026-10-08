import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ControlesDeAudioWs } from './controles-de-audio-ws';
import type { CanalDeAudio } from './controles-de-audio-ws';
import type { OpcionesDelCanalWs } from '@/lib/audio/canal-por-websocket';

/**
 * B3 (15-S2) · la consola con «Manos libres», los dos medidores en vivo y el
 * turno de palabra cuando la API mide que el equipo es semidúplex.
 */
const montar = async () => {
  let opciones: OpcionesDelCanalWs | null = null;
  const canal = {
    pulsar: vi.fn(async (): Promise<void> => opciones?.alEstado({ fase: 'hablando' })),
    manosLibresActivas: vi.fn(
      async (): Promise<void> => opciones?.alEstado({ fase: 'hablando', manosLibres: true }),
    ),
    soltar: vi.fn((): void => opciones?.alEstado({ fase: 'escuchando' })),
    cerrar: vi.fn((): void => undefined),
  };
  const crearCanal = (o: OpcionesDelCanalWs): CanalDeAudio => {
    opciones = o;
    return canal;
  };
  render(
    <ControlesDeAudioWs
      formatoAnunciado="g711u"
      pedirBillete={async () => 'billete-1'}
      crearCanal={crearCanal}
    />,
  );
  await act(async () => {
    await Promise.resolve();
  });
  act(() => opciones?.alEstado({ fase: 'escuchando' }));
  return { canal, o: () => opciones };
};

describe('ControlesDeAudioWs · manos libres (B3)', () => {
  it('«Manos libres» abre el micrófono hasta volver a pulsarlo; perder el foco no lo cierra', async () => {
    const { canal } = await montar();
    fireEvent.click(screen.getByRole('button', { name: /^Manos libres$/ }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(canal.manosLibresActivas).toHaveBeenCalledTimes(1);
    const activo = screen.getByRole('button', { name: /Manos libres: activas/ });
    expect(activo.getAttribute('aria-pressed')).toBe('true');
    fireEvent.blur(screen.getByRole('group'));
    expect(canal.soltar).not.toHaveBeenCalled();
    fireEvent.click(activo);
    expect(canal.soltar).toHaveBeenCalledTimes(1);
  });

  it('los dos sentidos en vivo: recibiendo del equipo y enviando', async () => {
    const { o } = await montar();
    act(() => o()?.alNiveles?.({ recibiendo: 0.25, enviando: 0.5 }));
    const medidores = screen.getAllByRole('meter');
    expect(medidores).toHaveLength(2);
    expect(medidores[0]?.getAttribute('value')).toBe('50');
    // Sin hablar, lo enviado es 0 aunque el micrófono diga otra cosa.
    expect(medidores[1]?.getAttribute('value')).toBe('0');
    expect(screen.getByText(/Recibiendo del equipo · nivel/)).toBeTruthy();
  });

  it('semidúplex medido: el turno de palabra se muestra y cambia al hablar', async () => {
    const { o } = await montar();
    expect(screen.getByText(/Se oye al equipo también mientras usted habla/)).toBeTruthy();
    act(() => o()?.alSemiduplex?.());
    expect(screen.getByRole('status').textContent).toMatch(/Turno de palabra: el equipo/);
    act(() => o()?.alEstado({ fase: 'hablando' }));
    expect(screen.getByRole('status').textContent).toMatch(/Turno de palabra: usted/);
  });
});

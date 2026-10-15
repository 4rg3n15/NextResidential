import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ControlesDeAudioWs } from './controles-de-audio-ws';
import type { CanalDeAudio } from './controles-de-audio-ws';
import type { OpcionesDelCanalWs } from '@/lib/audio/canal-por-websocket';

/**
 * DT-15S4-02 (15-S6) · la conversación sin un solo tramo: micrófono activo y
 * cero tramas salidas pasados 3 s → la guardia ve «no se está enviando audio».
 * En cuanto sale una trama, el aviso se va; sin recuento del canal, no se avisa.
 */
const montar = async () => {
  let opciones: OpcionesDelCanalWs | null = null;
  const canal = {
    pulsar: vi.fn(async (): Promise<void> => opciones?.alEstado({ fase: 'hablando' })),
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

const AVISO = /no se está enviando audio/;

describe('ControlesDeAudioWs · sin audio (DT-15S4-02)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hablando 3 s con cero tramas: avisa; con una trama, el aviso se va', async () => {
    const { canal, o } = await montar();
    await act(async () => {
      await canal.pulsar();
    });
    act(() => o()?.alNiveles?.({ recibiendo: 0.2, enviando: 0, tramasEnviadas: 0 }));
    expect(screen.queryByText(AVISO)).toBeNull();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole('alert').textContent).toMatch(AVISO);
    act(() => o()?.alNiveles?.({ recibiendo: 0.2, enviando: 0.3, tramasEnviadas: 7 }));
    expect(screen.queryByText(AVISO)).toBeNull();
  });

  it('al soltar, el aviso se va; y sin recuento del canal no se inventa', async () => {
    const { canal, o } = await montar();
    await act(async () => {
      await canal.pulsar();
    });
    act(() => o()?.alNiveles?.({ recibiendo: 0, enviando: 0 }));
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText(AVISO)).toBeNull();
    act(() => o()?.alNiveles?.({ recibiendo: 0, enviando: 0, tramasEnviadas: 0 }));
    expect(screen.getByRole('alert').textContent).toMatch(AVISO);
    act(() => canal.soltar());
    expect(screen.queryByText(AVISO)).toBeNull();
  });
});

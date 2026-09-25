import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { VideoEnVivo } from './video-en-vivo';
import { ErrorDeVistaEnVivo } from '@/lib/video/whep';
import type { ConexionEnVivo, OpcionesDeNegociacion } from '@/lib/video/whep';

const COP = '10000000-0000-4000-8000-000000000001';
const DISP = 'e0000000-0000-4000-8000-000000000002';

const esperar = () => act(async () => Promise.resolve());

describe('VideoEnVivo (A5)', () => {
  it('negocia contra la ruta del proxy y, al reproducir, muestra los dos tiempos', async () => {
    const cerrar = vi.fn();
    const urls: string[] = [];
    const negociar = vi.fn(
      async (url: string, _o: OpcionesDeNegociacion): Promise<ConexionEnVivo> => {
        urls.push(url);
        return { latenciaNegociacionMs: 120, cerrar };
      },
    );
    const vista = render(
      <VideoEnVivo copropiedadId={COP} dispositivoId={DISP} negociar={negociar} />,
    );
    expect(screen.getByRole('status').textContent).toContain('Negociando');
    await esperar();
    expect(urls[0]).toBe(`/api/ncr/copropiedades/${COP}/guardia/video/${DISP}/whep`);
    expect(screen.getByText('En vivo')).toBeTruthy();
    expect(screen.getByText(/negociación 120 ms/)).toBeTruthy();
    expect(screen.getByText(/primer cuadro pendiente/)).toBeTruthy();

    const video = vista.container.querySelector('video');
    expect(video).not.toBeNull();
    fireEvent(video as HTMLVideoElement, new Event('playing'));
    expect(screen.getByText(/primer cuadro \d+ ms/)).toBeTruthy();

    vista.unmount();
    expect(cerrar).toHaveBeenCalledTimes(1);
  });

  it('una negativa de la API se dice con su causa y ofrece reintentar', async () => {
    const negociar = vi
      .fn<(url: string, o: OpcionesDeNegociacion) => Promise<ConexionEnVivo>>()
      .mockRejectedValueOnce(new ErrorDeVistaEnVivo('sin_puente', 'falta GO2RTC_URL'))
      .mockResolvedValueOnce({ latenciaNegociacionMs: 80, cerrar: () => undefined });
    render(<VideoEnVivo copropiedadId={COP} dispositivoId={DISP} negociar={negociar} />);
    await esperar();
    expect(screen.getByText('Vista en vivo no desplegada')).toBeTruthy();
    expect(screen.getByText('falta GO2RTC_URL')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await esperar();
    expect(negociar).toHaveBeenCalledTimes(2);
    expect(screen.getByText('En vivo')).toBeTruthy();
  });

  it('«sin video» del equipo se distingue de un puente caído', async () => {
    const negociar = vi.fn(async () => {
      throw new ErrorDeVistaEnVivo('sin_video', 'es un controlador de E/S');
    });
    render(<VideoEnVivo copropiedadId={COP} dispositivoId={DISP} negociar={negociar} />);
    await esperar();
    expect(screen.getByText('Este equipo no ofrece video')).toBeTruthy();
  });
});

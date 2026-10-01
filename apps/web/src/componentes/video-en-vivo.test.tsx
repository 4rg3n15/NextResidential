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
    // E2/C1 (15-M) · con el remedio: cómo arrancar el puente.
    expect(screen.getByText(/falta GO2RTC_URL.*pnpm sitio:video/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await esperar();
    expect(negociar).toHaveBeenCalledTimes(2);
    expect(screen.getByText('En vivo')).toBeTruthy();
  });

  it('E2/C1 (15-M) · «HTTP 500 · EOF» del puente se dice en palabras, con remedio', async () => {
    const negociar = vi.fn(async () => {
      throw new ErrorDeVistaEnVivo(
        'puente',
        'El puente de video no atendió la petición: negociación WebRTC con el puente: HTTP 500 · EOF',
      );
    });
    render(<VideoEnVivo copropiedadId={COP} dispositivoId={DISP} negociar={negociar} />);
    await esperar();
    expect(screen.getByText('El puente de video no responde')).toBeTruthy();
    expect(
      screen.getByText(/^El equipo cerró la conexión de video \(backchannel\).*HTTP 500 · EOF/),
    ).toBeTruthy();
  });

  it('«sin video» del equipo se distingue de un puente caído', async () => {
    const negociar = vi.fn(async () => {
      throw new ErrorDeVistaEnVivo('sin_video', 'es un controlador de E/S');
    });
    render(<VideoEnVivo copropiedadId={COP} dispositivoId={DISP} negociar={negociar} />);
    await esperar();
    expect(screen.getByText('Sin video de este equipo')).toBeTruthy();
  });

  it('D2 (15-L) · con H.265 se dice el códec y qué hacer, no un negro', async () => {
    const negociar = vi.fn(async () => {
      throw new ErrorDeVistaEnVivo(
        'sin_video',
        'Este equipo entrega H.265 en el canal 101 y el navegador no lo reproduce: cámbielo a H.264',
      );
    });
    render(<VideoEnVivo copropiedadId={COP} dispositivoId={DISP} negociar={negociar} />);
    await esperar();
    expect(screen.getByText(/entrega H\.265 en el canal 101/)).toBeTruthy();
  });

  it('D3 (15-L) · negoció y no llega imagen: «Sin señal», con reintento', async () => {
    vi.useFakeTimers();
    try {
      const negociar = vi.fn(
        async (): Promise<ConexionEnVivo> => ({
          latenciaNegociacionMs: 50,
          cerrar: () => undefined,
        }),
      );
      render(
        <VideoEnVivo
          copropiedadId={COP}
          dispositivoId={DISP}
          negociar={negociar}
          plazoPrimerCuadroMs={1000}
        />,
      );
      await esperar();
      expect(screen.getByText('En vivo')).toBeTruthy();
      await act(async () => {
        vi.advanceTimersByTime(1001);
      });
      expect(screen.getByText('Sin señal')).toBeTruthy();
      expect(screen.getByRole('button', { name: /Reintentar/ })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('D3 (15-L) · con imagen a tiempo, no hay «sin señal»', async () => {
    vi.useFakeTimers();
    try {
      const negociar = vi.fn(
        async (): Promise<ConexionEnVivo> => ({
          latenciaNegociacionMs: 50,
          cerrar: () => undefined,
        }),
      );
      const vista = render(
        <VideoEnVivo
          copropiedadId={COP}
          dispositivoId={DISP}
          negociar={negociar}
          plazoPrimerCuadroMs={1000}
        />,
      );
      await esperar();
      fireEvent(vista.container.querySelector('video') as HTMLVideoElement, new Event('playing'));
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByText('Sin señal')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('D3 (15-L) · si la conexión se cae después de negociar, se dice', async () => {
    let cortar: (() => void) | undefined;
    const negociar = vi.fn(
      async (_u: string, o: OpcionesDeNegociacion): Promise<ConexionEnVivo> => {
        cortar = o.alCortarse;
        return { latenciaNegociacionMs: 50, cerrar: () => undefined };
      },
    );
    render(<VideoEnVivo copropiedadId={COP} dispositivoId={DISP} negociar={negociar} />);
    await esperar();
    await act(async () => {
      cortar?.();
    });
    expect(screen.getByText('Se cortó el video')).toBeTruthy();
  });
});

describe('15-P · 0.4 · cambiar de equipo aborta la negociación en vuelo', () => {
  it('la señal de la primera se aborta al pasar a otro equipo, y la segunda sigue viva', () => {
    const senales: AbortSignal[] = [];
    const negociar = vi.fn(
      (_url: string, opciones: OpcionesDeNegociacion) =>
        new Promise<ConexionEnVivo>(() => {
          if (opciones.senal !== undefined) senales.push(opciones.senal);
        }),
    );
    const vista = render(
      <VideoEnVivo copropiedadId={COP} dispositivoId={DISP} negociar={negociar} />,
    );
    vista.rerender(
      <VideoEnVivo copropiedadId={COP} dispositivoId="otro-equipo" negociar={negociar} />,
    );
    expect(negociar).toHaveBeenCalledTimes(2);
    expect(senales[0]?.aborted).toBe(true);
    expect(senales[1]?.aborted).toBe(false);
    vista.unmount();
    expect(senales[1]?.aborted).toBe(true);
  });
});

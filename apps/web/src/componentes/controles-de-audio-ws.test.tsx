import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ControlesDeAudioWs } from './controles-de-audio-ws';
import type { CanalDeAudio } from './controles-de-audio-ws';
import type { OpcionesDelCanalWs } from '@/lib/audio/canal-por-websocket';

/**
 * 15-P · P5 · el panel de «pulsar para hablar» sobre un canal de mentira: lo
 * que se prueba es qué pide la interfaz y cuándo, no el audio.
 */
const montar = (opciones: { readonly billete?: () => Promise<string> } = {}) => {
  const nuevoCanal = (o: OpcionesDelCanalWs) => ({
    pulsar: vi.fn(async (): Promise<void> => {
      o.alEstado({ fase: 'hablando' });
    }),
    soltar: vi.fn((): void => o.alEstado({ fase: 'escuchando' })),
    cerrar: vi.fn((): void => undefined),
  });
  const creados: {
    readonly opciones: OpcionesDelCanalWs;
    readonly canal: ReturnType<typeof nuevoCanal>;
  }[] = [];
  const crearCanal = (o: OpcionesDelCanalWs): CanalDeAudio => {
    const canal = nuevoCanal(o);
    creados.push({ opciones: o, canal });
    return canal;
  };
  const pedirBillete = vi.fn(opciones.billete ?? (async () => 'billete-1'));
  const vista = render(
    <ControlesDeAudioWs
      formatoAnunciado="g711u"
      pedirBillete={pedirBillete}
      crearCanal={crearCanal}
    />,
  );
  return { vista, creados, pedirBillete, crearCanal };
};

const listo = async (creados: { readonly opciones: OpcionesDelCanalWs }[]) => {
  await act(async () => {
    await Promise.resolve();
  });
  act(() => creados[0]?.opciones.alEstado({ fase: 'escuchando' }));
};

describe('ControlesDeAudioWs · pulsar para hablar', () => {
  it('pide el billete y abre el socket del MISMO origen; escucha sin pulsar nada', async () => {
    const { creados } = montar();
    await listo(creados);
    expect(creados[0]?.opciones.url).toBe(
      `ws://${window.location.host}/api/ncr-audio?billete=billete-1`,
    );
    expect(screen.getByText(/Escuchando al equipo/)).toBeTruthy();
  });

  it('mantener con el ratón o el dedo habla; soltar o cancelar escucha', async () => {
    const { creados } = montar();
    await listo(creados);
    const boton = screen.getByRole('button', { name: /Mantener para hablar/ });
    await act(async () => {
      fireEvent.pointerDown(boton, { pointerId: 1 });
    });
    expect(creados[0]?.canal.pulsar).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /suelte para escuchar/ }).getAttribute('aria-pressed'),
    ).toBe('true');
    act(() => {
      fireEvent.pointerUp(boton, { pointerId: 1 });
    });
    expect(creados[0]?.canal.soltar).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.pointerCancel(boton, { pointerId: 1 });
    });
    expect(creados[0]?.canal.soltar).toHaveBeenCalledTimes(2);
  });

  it('la barra espaciadora con el foco en el panel: la repetición no pulsa dos veces; perder el foco suelta', async () => {
    const { creados } = montar();
    await listo(creados);
    const panel = screen.getByRole('group', { name: /barra espaciadora/ });
    await act(async () => {
      fireEvent.keyDown(panel, { key: ' ' });
      fireEvent.keyDown(panel, { key: ' ', repeat: true });
    });
    expect(creados[0]?.canal.pulsar).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.keyUp(panel, { key: ' ' });
    });
    expect(creados[0]?.canal.soltar).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent.blur(panel);
    });
    expect(creados[0]?.canal.soltar).toHaveBeenCalledTimes(2);
  });

  it('desmontar (colgar o cambiar de equipo) y cerrar la pestaña cuelgan el canal', async () => {
    const primero = montar();
    await listo(primero.creados);
    primero.vista.unmount();
    expect(primero.creados[0]?.canal.cerrar).toHaveBeenCalledTimes(1);

    const segundo = montar();
    await listo(segundo.creados);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(segundo.creados[0]?.canal.cerrar).toHaveBeenCalledTimes(1);
  });

  it('sin billete (la API dice que no): estado de error con el motivo y sin socket', async () => {
    const { creados } = montar({
      billete: async () => Promise.reject(new Error('Sin la palabra')),
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(creados).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toBe('Sin la palabra');
    expect(
      screen.getByRole('button', { name: /Mantener para hablar/ }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('el navegador niega el micrófono: lo dice en palabras', async () => {
    const { creados } = montar();
    await listo(creados);
    const negado = Object.assign(new Error('denegado'), { name: 'NotAllowedError' });
    creados[0]?.canal.pulsar.mockRejectedValueOnce(negado);
    await act(async () => {
      fireEvent.pointerDown(screen.getByRole('button', { name: /Mantener para hablar/ }), {
        pointerId: 1,
      });
    });
    expect(screen.getByRole('alert').textContent).toMatch(/no dio el micrófono/);
  });

  it('un aviso del servidor (tramo cortado) se enseña; un cierre, con su motivo', async () => {
    const { creados } = montar();
    await listo(creados);
    act(() =>
      creados[0]?.opciones.alEstado({ fase: 'escuchando', aviso: 'El tramo superó los 60 s' }),
    );
    expect(screen.getByRole('status').textContent).toBe('El tramo superó los 60 s');
    act(() =>
      creados[0]?.opciones.alEstado({ fase: 'cerrado', motivo: 'El turno caducó por inactividad' }),
    );
    expect(screen.getByRole('alert').textContent).toBe('El turno caducó por inactividad');
  });

  it('un códec que la consola no sabe reproducir no abre nada', () => {
    const crearCanal = vi.fn();
    render(
      <ControlesDeAudioWs
        formatoAnunciado="G.722.1"
        pedirBillete={vi.fn()}
        crearCanal={crearCanal}
      />,
    );
    expect(screen.getByRole('status').textContent).toMatch(/sólo reproduce G\.711/);
    expect(crearCanal).not.toHaveBeenCalled();
  });
});

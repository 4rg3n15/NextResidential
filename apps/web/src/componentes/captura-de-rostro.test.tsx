import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CapturaDeRostro } from './captura-de-rostro';

const montar = () =>
  render(
    <CapturaDeRostro
      alCambiar={() => undefined}
      titulo="Registrar mi rostro"
      indicacion="De frente, con buena luz."
    />,
  );

afterEach(() => vi.unstubAllGlobals());

describe('la captura del rostro en el navegador (15-Y3)', () => {
  it('con la cámara negada, lo dice y deja elegir una foto', async () => {
    const getUserMedia = vi.fn(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    vi.stubGlobal('navigator', { ...globalThis.navigator, mediaDevices: { getUserMedia } });
    montar();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir la cámara' }));
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    const [restricciones] = getUserMedia.mock.calls[0] as unknown as [
      { video: { facingMode: string } },
    ];
    expect(restricciones.video.facingMode).toBe('user');
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/No se pudo abrir la cámara/),
    );
    expect(screen.getByLabelText('Elegir una foto')).toBeTruthy();
  });

  it('sin cámara en este navegador, sólo queda la foto', () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, mediaDevices: undefined });
    montar();
    expect(screen.queryByRole('button', { name: 'Abrir la cámara' })).toBeNull();
    expect(screen.getByText(/Este navegador no puede abrir la cámara/)).toBeTruthy();
    expect(screen.getByLabelText('Elegir una foto')).toBeTruthy();
  });
});

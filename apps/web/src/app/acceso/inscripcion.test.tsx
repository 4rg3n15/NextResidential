import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InscripcionDeFactor } from './inscripcion-factor';
import { CodigosDeRecuperacion } from './codigos-recuperacion';

/**
 * Las dos pantallas que convierten «tiene un rol» en «puede entrar».
 *
 * Se prueban por el comportamiento que el titular ve, no por el estado interno:
 * que existe una vía para quien no puede escanear el QR, que el paso de códigos
 * no se despacha con un clic distraído, y que un fallo al generarlos no deja
 * fuera a quien ya tiene el factor verificado.
 */
let fetchFalso: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchFalso = vi.fn(
    async () =>
      new Response(JSON.stringify({ qr: '<svg/>', secreto: 'JBSW Y3DP EHPK 3PXP' }), {
        status: 200,
      }),
  );
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

describe('inscripción del segundo factor', () => {
  it('ofrece el secreto en texto para quien no puede escanear el QR', async () => {
    render(<InscripcionDeFactor alVerificar={() => undefined} alCancelar={() => undefined} />);

    // El secreto no se muestra de entrada: en una portería la pantalla la ve
    // todo el que pasa. Se enseña cuando el titular lo pide.
    await waitFor(() => expect(screen.getByRole('img', { hidden: true })).toBeTruthy());
    expect(screen.queryByText(/JBSW Y3DP/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /no puedes escanear/i }));
    expect(screen.getByText(/JBSW Y3DP/)).toBeTruthy();
  });

  it('no envía ningún identificador de usuario: la identidad la pone el servidor', async () => {
    render(<InscripcionDeFactor alVerificar={() => undefined} alCancelar={() => undefined} />);
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    const [, opciones] = fetchFalso.mock.calls[0] as [string, RequestInit | undefined];
    expect(opciones?.body ?? '').toBe('');
  });

  it('un fallo del servidor se cuenta, no se traga', async () => {
    fetchFalso.mockResolvedValue(new Response(JSON.stringify({ mensaje: 'Vuelve a intentarlo.' }), { status: 503 }));
    render(<InscripcionDeFactor alVerificar={() => undefined} alCancelar={() => undefined} />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Vuelve a intentarlo.'));
  });
});

describe('códigos de recuperación', () => {
  const conCodigos = (): void => {
    fetchFalso.mockResolvedValue(
      new Response(JSON.stringify({ codigos: ['AAAAA-BBBBB', 'CCCCC-DDDDD'], cantidad: 2 }), {
        status: 200,
      }),
    );
  };

  it('no deja continuar hasta que se confirma que se han guardado', async () => {
    conCodigos();
    const terminar = vi.fn();
    render(<CodigosDeRecuperacion alTerminar={terminar} />);

    const entrar = await screen.findByRole('button', { name: /entrar a la consola/i });
    fireEvent.click(entrar);
    expect(terminar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(entrar);
    expect(terminar).toHaveBeenCalledOnce();
  });

  it('dice que un código NO da acceso, que es lo que se malinterpreta', async () => {
    conCodigos();
    render(<CodigosDeRecuperacion alTerminar={() => undefined} />);
    expect((await screen.findByText(/no da acceso/i)).textContent).toBeTruthy();
  });

  it('si no se pueden generar, el titular entra igual: ya tiene el factor verificado', async () => {
    fetchFalso.mockResolvedValue(new Response('{}', { status: 500 }));
    const terminar = vi.fn();
    render(<CodigosDeRecuperacion alTerminar={terminar} />);

    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: /entrar a la consola/i }));
    expect(terminar).toHaveBeenCalledOnce();
  });
});

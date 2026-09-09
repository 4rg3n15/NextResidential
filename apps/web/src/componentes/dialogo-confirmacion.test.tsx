import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DialogoDeConfirmacion, MINIMO_MOTIVO } from './dialogo-confirmacion';

/**
 * RN-08, CA-16, CA-17 · **sin motivo no se ejecuta la apertura**.
 *
 * La consola no hace cumplir la regla —el backend rechaza la petición sin
 * motivo—, pero sí impide llegar a intentarlo. Si el botón se habilitara con el
 * campo vacío, el operador enviaría una petición que la API va a rechazar y
 * leería un error técnico donde debería haber una instrucción.
 */
const props = {
  abierto: true,
  titulo: 'Denegar acceso',
  descripcion: 'La decisión queda atribuida a tu usuario.',
  etiquetaConfirmar: 'Denegar',
  alCancelar: () => undefined,
};

describe('DialogoDeConfirmacion', () => {
  it('el botón de confirmar nace deshabilitado', () => {
    render(<DialogoDeConfirmacion {...props} alConfirmar={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Denegar' })).toHaveProperty('disabled', true);
  });

  it('un motivo demasiado corto no habilita la acción', () => {
    render(<DialogoDeConfirmacion {...props} alConfirmar={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Motivo/), {
      target: { value: 'x'.repeat(MINIMO_MOTIVO - 1) },
    });
    expect(screen.getByRole('button', { name: 'Denegar' })).toHaveProperty('disabled', true);
  });

  it('un motivo de solo espacios tampoco cuenta', () => {
    // Sin el recorte, cinco espacios pasarían por motivo y la auditoría
    // guardaría una cadena vacía como justificación de una apertura.
    render(<DialogoDeConfirmacion {...props} alConfirmar={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: '        ' } });
    expect(screen.getByRole('button', { name: 'Denegar' })).toHaveProperty('disabled', true);
  });

  it('con un motivo suficiente se habilita y se envía RECORTADO', () => {
    const alConfirmar = vi.fn();
    render(<DialogoDeConfirmacion {...props} alConfirmar={alConfirmar} />);
    fireEvent.change(screen.getByLabelText(/Motivo/), {
      target: { value: '  Visitante sin autorización vigente  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Denegar' }));
    expect(alConfirmar).toHaveBeenCalledWith('Visitante sin autorización vigente');
  });

  it('la etiqueta del motivo dice explícitamente que es obligatorio', () => {
    render(<DialogoDeConfirmacion {...props} alConfirmar={() => undefined} />);
    expect(screen.getByText('(obligatorio)')).toBeDefined();
  });

  it('avisa de que el motivo queda en la auditoría y no se puede cambiar', () => {
    render(<DialogoDeConfirmacion {...props} alConfirmar={() => undefined} />);
    expect(screen.getByText(/auditoría/)).toBeDefined();
  });

  it('mientras se envía no se puede reenviar', () => {
    const alConfirmar = vi.fn();
    render(<DialogoDeConfirmacion {...props} enviando alConfirmar={alConfirmar} />);
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Motivo válido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Denegar' }));
    expect(alConfirmar).not.toHaveBeenCalled();
  });
});

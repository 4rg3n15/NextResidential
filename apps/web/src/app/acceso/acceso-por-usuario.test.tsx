import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormularioDeAcceso } from './formulario-acceso';

/** Una contraseña de prueba cualquiera: sólo tiene que viajar intacta. */
const CLAVE = 'Clave#2026x';

const reemplazar = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: reemplazar, refresh: vi.fn(), push: vi.fn() }),
}));

let fetchFalso: ReturnType<typeof vi.fn>;
const cuerpoDe = (llamada: number): Record<string, unknown> =>
  JSON.parse(String((fetchFalso.mock.calls[llamada] as [string, RequestInit])[1].body)) as Record<
    string,
    unknown
  >;

beforeEach(() => {
  window.localStorage.clear();
  reemplazar.mockReset();
  fetchFalso = vi.fn(
    async () => new Response(JSON.stringify({ siguiente: 'consola' }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

const escribir = (etiqueta: RegExp, valor: string): void => {
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
};

describe('acceso por número de portero, usuario con código, o correo (ADR-031, D1)', () => {
  it('H3 · sólo cifras es el NÚMERO de un portero: sin segundo campo, y se envía solo', async () => {
    render(<FormularioDeAcceso />);
    escribir(/^Usuario$/, '1001');
    expect(screen.queryByLabelText(/Código de la copropiedad/)).toBeNull();
    escribir(/^Contraseña$/, CLAVE);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    expect(cuerpoDe(0)).toEqual({ usuario: '1001', contrasena: CLAVE, recordar: false });
    expect(window.localStorage.getItem('ncr:copropiedad-de-acceso')).toBeNull();
  });

  it('D1 · un usuario con letras pide el CÓDIGO de la copropiedad, lo envía y lo recuerda', async () => {
    render(<FormularioDeAcceso />);
    escribir(/^Usuario$/, 'casa42.ana');
    escribir(/Código de la copropiedad/, 'mira');
    escribir(/^Contraseña$/, CLAVE);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    expect(cuerpoDe(0)).toMatchObject({ codigo: 'mira', usuario: 'casa42.ana' });
    expect(window.localStorage.getItem('ncr:copropiedad-de-acceso')).toBe('mira');
  });

  it('recuerda el código del ingreso anterior; un NIT guardado con la clave antigua NO se lee', () => {
    window.localStorage.setItem('ncr:nit-de-acceso', '900123456');
    render(<FormularioDeAcceso />);
    escribir(/^Usuario$/, 'casa42.ana');
    expect((screen.getByLabelText(/Código de la copropiedad/) as HTMLInputElement).value).toBe('');
  });

  it('con arroba es un CORREO, como hasta ahora, y no pide código', async () => {
    render(<FormularioDeAcceso />);
    escribir(/^Usuario$/, 'admin@copropiedad.co');
    expect(screen.queryByLabelText(/Código de la copropiedad/)).toBeNull();
    escribir(/^Contraseña$/, CLAVE);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    expect(cuerpoDe(0)).toMatchObject({ correo: 'admin@copropiedad.co' });
    expect(cuerpoDe(0)).not.toHaveProperty('usuario');
  });

  it('el NIT no aparece en ninguna parte del formulario', () => {
    render(<FormularioDeAcceso />);
    escribir(/^Usuario$/, 'casa42.ana');
    expect(document.body.textContent ?? '').not.toMatch(/\bNIT\b/);
  });

  it('con el cambio pendiente la consola lleva al cambio de contraseña, no al tablero', async () => {
    fetchFalso.mockResolvedValueOnce(
      new Response(JSON.stringify({ siguiente: 'cambio-de-contrasena' }), { status: 200 }),
    );
    render(<FormularioDeAcceso />);
    escribir(/^Usuario$/, '1001');
    escribir(/^Contraseña$/, 'Inicial#2026');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Cambia tu contraseña' })).toBeTruthy(),
    );
    expect(reemplazar).not.toHaveBeenCalled();
  });
});

describe('cambio obligatorio del primer ingreso', () => {
  it('no deja enviar una nueva igual a la actual, y envía actual y nueva al servidor', async () => {
    fetchFalso.mockResolvedValueOnce(
      new Response(JSON.stringify({ siguiente: 'consola' }), { status: 200 }),
    );
    render(<FormularioDeAcceso pasoInicial="cambio" />);
    const boton = screen.getByRole('button', { name: 'Cambiar y continuar' }) as HTMLButtonElement;
    escribir(/Contraseña actual/, 'Inicial#2026');
    escribir(/^Contraseña nueva$/, 'Inicial#2026');
    escribir(/Repite la contraseña nueva/, 'Inicial#2026');
    expect(boton.disabled).toBe(true);
    expect(screen.getByText('Tiene que ser distinta de la actual.')).toBeTruthy();
    escribir(/^Contraseña nueva$/, 'Garita#2026x');
    escribir(/Repite la contraseña nueva/, 'Garita#2026x');
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    expect((fetchFalso.mock.calls[0] as [string])[0]).toBe('/api/sesion/contrasena');
    expect(cuerpoDe(0)).toEqual({ actual: 'Inicial#2026', nueva: 'Garita#2026x' });
    await waitFor(() => expect(reemplazar).toHaveBeenCalledWith('/'));
  });
});

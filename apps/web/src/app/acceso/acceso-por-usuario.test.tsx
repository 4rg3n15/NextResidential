import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormularioDeAcceso } from './formulario-acceso';

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

describe('acceso por usuario con código o NIT (ADR-023, C-34, D1)', () => {
  it('sin arroba es un USUARIO: con un NIT lo envía como NIT y lo recuerda', async () => {
    render(<FormularioDeAcceso />);
    expect(screen.queryByLabelText(/Código o NIT de la copropiedad/)).toBeNull();
    escribir(/Correo o usuario/, 'porteria.norte');
    escribir(/Código o NIT de la copropiedad/, '900123456-7');
    escribir(/^Contraseña$/, 'Clave#2026x');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    expect(cuerpoDe(0)).toMatchObject({ nit: '900123456-7', usuario: 'porteria.norte' });
    expect(cuerpoDe(0)).not.toHaveProperty('correo');
    expect(cuerpoDe(0)).not.toHaveProperty('codigo');
    expect(window.localStorage.getItem('ncr:copropiedad-de-acceso')).toBe('900123456-7');
  });

  it('D1 · con un CÓDIGO corto lo envía como código, no como NIT', async () => {
    render(<FormularioDeAcceso />);
    escribir(/Correo o usuario/, 'casa42.ana');
    escribir(/Código o NIT de la copropiedad/, 'mira');
    escribir(/^Contraseña$/, 'Clave#2026x');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    expect(cuerpoDe(0)).toMatchObject({ codigo: 'mira', usuario: 'casa42.ana' });
    expect(cuerpoDe(0)).not.toHaveProperty('nit');
  });

  it('recuerda la copropiedad del ingreso anterior, también la guardada como NIT', () => {
    window.localStorage.setItem('ncr:nit-de-acceso', '900123456');
    render(<FormularioDeAcceso />);
    escribir(/Correo o usuario/, 'porteria.norte');
    expect((screen.getByLabelText(/Código o NIT/) as HTMLInputElement).value).toBe('900123456');
  });

  it('con arroba es un CORREO, como hasta ahora, y no pide NIT', async () => {
    render(<FormularioDeAcceso />);
    escribir(/Correo o usuario/, 'admin@copropiedad.co');
    expect(screen.queryByLabelText(/Código o NIT de la copropiedad/)).toBeNull();
    escribir(/^Contraseña$/, 'Clave#2026x');
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalled());
    expect(cuerpoDe(0)).toMatchObject({ correo: 'admin@copropiedad.co' });
    expect(cuerpoDe(0)).not.toHaveProperty('nit');
  });

  it('con el cambio pendiente la consola lleva al cambio de contraseña, no al tablero', async () => {
    fetchFalso.mockResolvedValueOnce(
      new Response(JSON.stringify({ siguiente: 'cambio-de-contrasena' }), { status: 200 }),
    );
    render(<FormularioDeAcceso />);
    escribir(/Correo o usuario/, 'porteria.norte');
    escribir(/Código o NIT de la copropiedad/, '900123456');
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

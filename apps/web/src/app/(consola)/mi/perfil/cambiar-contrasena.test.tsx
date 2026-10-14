import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CambiarContrasena } from './cambiar-contrasena';

/** 15-Y1 · el residente cambia su contraseña desde el Perfil, en la consola. */
const reemplazar = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: reemplazar, refresh: vi.fn(), push: vi.fn() }),
}));

let respuesta: () => Response | Promise<Response> = () =>
  new Response(JSON.stringify({ siguiente: 'consola' }), { status: 200 });
let cuerpos: unknown[] = [];
beforeEach(() => {
  cuerpos = [];
  reemplazar.mockReset();
  respuesta = () => new Response(JSON.stringify({ siguiente: 'consola' }), { status: 200 });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: string, init?: RequestInit) => {
      cuerpos.push(typeof init?.body === 'string' ? JSON.parse(init.body) : null);
      return respuesta();
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const llenar = (actual = 'Vieja#2026xy', nueva = 'Nueva#2026xy', repetida = nueva) => {
  fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: actual } });
  fireEvent.change(screen.getByLabelText('Contraseña nueva'), { target: { value: nueva } });
  fireEvent.change(screen.getByLabelText('Repita la contraseña nueva'), {
    target: { value: repetida },
  });
};
const boton = () => screen.getByRole('button', { name: /Cambiar contraseña/ }) as HTMLButtonElement;

describe('CambiarContrasena', () => {
  it('no envía hasta que la nueva cumple la política, se repite igual y es distinta de la actual', () => {
    render(<CambiarContrasena alCerrar={() => undefined} />);
    llenar('Vieja#2026xy', 'corta', 'corta');
    expect(boton().disabled).toBe(true);
    llenar('Vieja#2026xy', 'Nueva#2026xy', 'Otra#2026xy');
    expect(screen.getByText('Las dos contraseñas no coinciden')).toBeTruthy();
    expect(boton().disabled).toBe(true);
    llenar('Nueva#2026xy', 'Nueva#2026xy');
    expect(screen.getByText('Tiene que ser distinta de la actual.')).toBeTruthy();
    llenar();
    expect(boton().disabled).toBe(false);
  });

  it('cambia por la ruta de sesión de la consola y lo confirma', async () => {
    render(<CambiarContrasena alCerrar={() => undefined} />);
    llenar();
    fireEvent.click(boton());
    expect(await screen.findByText(/Contraseña cambiada/)).toBeTruthy();
    expect(cuerpos[0]).toEqual({ actual: 'Vieja#2026xy', nueva: 'Nueva#2026xy' });
    expect(reemplazar).not.toHaveBeenCalled();
  });

  it('si el proveedor no renueva la sesión, vuelve al acceso con aviso', async () => {
    respuesta = () => new Response(JSON.stringify({ siguiente: 'acceso' }), { status: 200 });
    render(<CambiarContrasena alCerrar={() => undefined} />);
    llenar();
    fireEvent.click(boton());
    await waitFor(() => expect(reemplazar).toHaveBeenCalledWith('/acceso?aviso=cambio'));
  });

  it('la actual equivocada: el mensaje de la consola bajo el campo; sin conexión: se dice', async () => {
    respuesta = () =>
      new Response(JSON.stringify({ mensaje: 'La contraseña actual no es correcta.' }), {
        status: 400,
      });
    render(<CambiarContrasena alCerrar={() => undefined} />);
    llenar();
    fireEvent.click(boton());
    expect(await screen.findByText('La contraseña actual no es correcta.')).toBeTruthy();
    respuesta = () => Promise.reject(new TypeError('Failed to fetch'));
    fireEvent.click(boton());
    expect(await screen.findByText(/No hay conexión con la consola/)).toBeTruthy();
  });
});

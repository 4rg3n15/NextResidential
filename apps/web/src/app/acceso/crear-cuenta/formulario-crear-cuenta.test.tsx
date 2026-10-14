import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormularioDeCrearCuenta } from './formulario-crear-cuenta';

/**
 * 15-Y1 · «Crear cuenta» en la consola: los cinco estados de la política y del
 * envío, el código inválido con la respuesta genérica del servidor, el menor
 * que no envía nada, el usuario ocupado bajo su campo y la política que cambió.
 */
const reemplazar = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: reemplazar, refresh: vi.fn(), push: vi.fn() }),
}));

const POLITICA = { version: '2026-10-provisional-1', texto: 'Texto de la política de prueba.' };
const AHORA = () => new Date('2026-10-14T15:00:00Z');
/** Una clave de prueba que cumple la política; se nombra aparte por el escáner de secretos (§2.5). */
const CLAVE = 'Clave#2026xy';
const json = (cuerpo: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

let peticiones: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
let politica: () => Response | Promise<Response> = () => json(POLITICA);
let registro: () => Response | Promise<Response> = () => json({ creada: true }, 201);
let sesion: () => Response = () => json({ siguiente: 'consola' });

beforeEach(() => {
  peticiones = [];
  reemplazar.mockReset();
  politica = () => json(POLITICA);
  registro = () => json({ creada: true }, 201);
  sesion = () => json({ siguiente: 'consola' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
      const ruta =
        typeof entrada === 'string'
          ? entrada
          : entrada instanceof URL
            ? entrada.pathname
            : new URL(entrada.url).pathname;
      const metodo = init?.method ?? 'GET';
      const cuerpo = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null;
      peticiones.push({ metodo, ruta, cuerpo });
      if (ruta === '/api/registro' && metodo === 'GET') return politica();
      if (ruta === '/api/registro') return registro();
      if (ruta === '/api/sesion') return sesion();
      return json({ mensaje: 'ruta no prevista' }, 500);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const escribir = (etiqueta: string | RegExp, valor: string) => {
  const campo = screen.getByLabelText(etiqueta);
  fireEvent.change(campo, { target: { value: valor } });
  fireEvent.blur(campo);
};
const llenar = (parte: Partial<Record<string, string>> = {}) => {
  escribir('Usuario', parte['usuario'] ?? 'Ana.Perez');
  escribir(/Correo de contacto/, 'ana@ejemplo.invalid');
  escribir(/^Contraseña$/, CLAVE);
  escribir(/Confirme la contraseña/, CLAVE);
  escribir(/Código de invitación/, parte['codigo'] ?? 'mira-k7pq-2xwz');
  escribir(/Fecha de nacimiento/, parte['fecha'] ?? '1990-05-17');
};
const aceptar = async () => {
  fireEvent.click(await screen.findByLabelText(/He leído y acepto/));
};
const boton = () => screen.getByRole('button', { name: /Crear cuenta|Creando/ });

describe('FormularioDeCrearCuenta', () => {
  it('cargando: la política se pide al abrir y el botón espera', () => {
    politica = () => new Promise(() => undefined);
    render(<FormularioDeCrearCuenta ahora={AHORA} />);
    expect(screen.getByText(/Cargando la política/)).toBeTruthy();
    expect((boton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('sin política no hay cuenta: lo dice y ofrece reintentar', async () => {
    politica = () => json({ mensaje: 'La API de Next Control no responde.' }, 502);
    render(<FormularioDeCrearCuenta ahora={AHORA} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText(/sin aceptarla no se crea la cuenta/)).toBeTruthy();
    politica = () => json(POLITICA);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(POLITICA.texto)).toBeTruthy();
  });

  it('crea la cuenta con el usuario normalizado y entra con el prefijo del código', async () => {
    render(<FormularioDeCrearCuenta ahora={AHORA} />);
    await aceptar();
    llenar();
    expect((boton() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(boton());
    await waitFor(() => expect(reemplazar).toHaveBeenCalledWith('/'));
    const envio = peticiones.find((p) => p.ruta === '/api/registro' && p.metodo === 'POST');
    expect(envio?.cuerpo).toMatchObject({
      usuario: 'ana.perez',
      correo: 'ana@ejemplo.invalid',
      codigoDeInvitacion: 'mira-k7pq-2xwz',
      fechaNacimiento: '1990-05-17',
      aceptaTratamientoDeDatos: true,
      versionPolitica: POLITICA.version,
    });
    const entrada = peticiones.find((p) => p.ruta === '/api/sesion');
    expect(entrada?.cuerpo).toEqual({
      codigo: 'MIRA',
      usuario: 'ana.perez',
      contrasena: CLAVE,
      recordar: false,
    });
  });

  it('creada pero sin poder entrar: lo dice con el código de la copropiedad y deja reintentar', async () => {
    sesion = () => json({ mensaje: 'Credenciales inválidas' }, 401);
    render(<FormularioDeCrearCuenta ahora={AHORA} />);
    await aceptar();
    llenar();
    fireEvent.click(boton());
    expect(
      await screen.findByText(/Su cuenta quedó creada, pero todavía no se pudo entrar/),
    ).toBeTruthy();
    expect(screen.getByText(/con el código MIRA/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Intentar entrar' })).toBeTruthy();
    expect(reemplazar).not.toHaveBeenCalled();
  });

  it('un código inválido, usado o ajeno: la respuesta genérica del servidor, tal cual', async () => {
    registro = () =>
      json(
        {
          estado: 400,
          mensaje: {
            message: 'El código de invitación no es válido o ya se usó',
            politica: POLITICA,
          },
        },
        400,
      );
    render(<FormularioDeCrearCuenta ahora={AHORA} />);
    await aceptar();
    llenar({ codigo: 'MIRA-0000-0000' });
    fireEvent.click(boton());
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'El código de invitación no es válido o ya se usó',
    );
    expect(peticiones.some((p) => p.ruta === '/api/sesion')).toBe(false);
  });

  it('un menor de edad no envía nada: la fecha lo dice antes', async () => {
    render(<FormularioDeCrearCuenta ahora={AHORA} />);
    await aceptar();
    llenar({ fecha: '2010-05-17' });
    expect(screen.getByText(/Un adulto de su hogar lo registra desde Mi familia/)).toBeTruthy();
    fireEvent.click(boton());
    await new Promise((r) => setTimeout(r, 20));
    expect(peticiones.some((p) => p.ruta === '/api/registro' && p.metodo === 'POST')).toBe(false);
  });

  it('usuario ocupado (409): bajo su campo; política cambiada: casilla desmarcada y aviso', async () => {
    registro = () =>
      json(
        {
          estado: 409,
          mensaje: {
            message: 'Ese usuario no está disponible',
            codigo: 'USUARIO_NO_DISPONIBLE',
            politica: { version: 'v2', texto: 'Texto nuevo.' },
          },
        },
        409,
      );
    render(<FormularioDeCrearCuenta ahora={AHORA} />);
    await aceptar();
    llenar();
    fireEvent.click(boton());
    expect(await screen.findByText('Ese usuario no está disponible')).toBeTruthy();
    expect(screen.getByText('Texto nuevo.')).toBeTruthy();
    expect((screen.getByLabelText(/He leído y acepto/) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(/La política cambió mientras llenaba el formulario/)).toBeTruthy();
  });

  it('sin conexión: cuando fetch ni siquiera responde', async () => {
    registro = () => Promise.reject(new TypeError('Failed to fetch'));
    render(<FormularioDeCrearCuenta ahora={AHORA} />);
    await aceptar();
    llenar();
    fireEvent.click(boton());
    expect(await screen.findByText(/No hay conexión con la consola/)).toBeTruthy();
  });

  it('demasiados intentos (429): la espera del Retry-After', async () => {
    registro = () => json({ mensaje: 'x' }, 429, { 'Retry-After': '120' });
    render(<FormularioDeCrearCuenta ahora={AHORA} />);
    await aceptar();
    llenar();
    fireEvent.click(boton());
    expect(await screen.findByText(/Espere 2 minutos y vuelva a intentarlo/)).toBeTruthy();
  });
});

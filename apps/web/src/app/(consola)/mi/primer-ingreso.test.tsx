import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PuertaDelPrimerIngreso } from './puerta-del-primer-ingreso';
import { claveDeAhoraNo } from '@/lib/rostro';
import { motivosLocales } from './primer-ingreso';

/**
 * 15-Y1 · la puerta del primer ingreso en la consola: cargando, error, sin
 * vivienda, con persona (pasa), y el formulario que completa a la persona.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const ALTA = {
  completa: false,
  viviendaVinculada: false,
  viviendaAsignada: true,
  debeDeclararOcupantes: false,
  vocabulario: {
    copropiedadNombre: 'Mirador',
    tipo: null,
    etiquetaVivienda: 'Apartamento',
    etiquetaAgrupacion: 'Torre',
    codigoCorto: 'MIRA',
  },
  pideAgrupacion: false,
  avisoOcupantes: '',
};
const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

let alta: () => Response | Promise<Response> = () => json(ALTA);
let envio: () => Response = () =>
  json({
    vinculada: true,
    debeDeclararOcupantes: false,
    motivo: null,
    explicacion: null,
    campos: [],
  });
let cuerpos: unknown[] = [];
beforeEach(() => {
  cuerpos = [];
  alta = () => json(ALTA);
  envio = () =>
    json({
      vinculada: true,
      debeDeclararOcupantes: false,
      motivo: null,
      explicacion: null,
      campos: [],
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (p: Request) => {
      if (p.method === 'POST') {
        cuerpos.push(await p.clone().json());
        return envio();
      }
      return alta();
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const envolver = (nodo: JSX.Element) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {nodo}
    </QueryClientProvider>,
  );
// 15-Y3 · la invitación del rostro ya se respondió en este navegador: aquí se prueba la PUERTA.
const puerta = () => {
  localStorage.setItem(claveDeAhoraNo('u-prueba'), 'si');
  return (
    <PuertaDelPrimerIngreso copropiedadId={COP} cuenta="u-prueba">
      <p>Inicio del residente</p>
    </PuertaDelPrimerIngreso>
  );
};
const escribir = (etiqueta: string | RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

describe('PuertaDelPrimerIngreso', () => {
  it('cargando, y con persona ya vinculada pasa al inicio', async () => {
    alta = () => json({ ...ALTA, viviendaVinculada: true });
    envolver(puerta());
    expect(screen.getByText(/Cargando tu cuenta/)).toBeTruthy();
    expect(await screen.findByText('Inicio del residente')).toBeTruthy();
  });

  it('sin vivienda asignada: la administración debe asignarla', async () => {
    alta = () => json({ ...ALTA, viviendaAsignada: false });
    envolver(puerta());
    expect(await screen.findByText(/La administración debe asignarle su vivienda/)).toBeTruthy();
  });

  it('error de la API y sin conexión', async () => {
    alta = () => json({ estado: 403, mensaje: 'Rol no autorizado' }, 403);
    envolver(puerta());
    expect(await screen.findByText(/Sin permiso/)).toBeTruthy();
    alta = () => Promise.reject(new TypeError('Failed to fetch'));
    envolver(puerta());
    expect(await screen.findByText(/Sin conexión/)).toBeTruthy();
  });

  it('sin persona: el formulario; un menor no se envía; completo, se envía y pasa al inicio', async () => {
    envolver(puerta());
    expect(await screen.findByText('Primer ingreso')).toBeTruthy();
    escribir('Nombres', 'Ana');
    escribir('Apellidos', 'Pérez');
    escribir('Número de documento', '1023456789');
    escribir('Teléfono', '3001234567');
    escribir('Fecha de nacimiento', '2012-01-01');
    fireEvent.click(screen.getByRole('button', { name: /Guardar y continuar/ }));
    expect(await screen.findByText(/Las cuentas son para mayores de edad/)).toBeTruthy();
    expect(cuerpos).toHaveLength(0);
    escribir('Fecha de nacimiento', '1990-05-17');
    alta = () => json({ ...ALTA, viviendaVinculada: true });
    fireEvent.click(screen.getByRole('button', { name: /Guardar y continuar/ }));
    await waitFor(() => expect(cuerpos).toHaveLength(1));
    expect(cuerpos[0]).toEqual({
      nombres: 'Ana',
      apellidos: 'Pérez',
      tipoDocumento: 'cedula',
      numeroDocumento: '1023456789',
      telefono: '3001234567',
      fechaNacimiento: '1990-05-17',
      correo: null,
    });
    expect(await screen.findByText('Inicio del residente')).toBeTruthy();
  });

  it('el servidor rechaza por campo o con motivo: se enseña donde toca', async () => {
    envio = () =>
      json({
        vinculada: false,
        debeDeclararOcupantes: false,
        motivo: 'DOCUMENTO_EN_USO',
        explicacion: 'El documento pertenece a otra cuenta',
        campos: [],
      });
    envolver(puerta());
    await screen.findByText('Primer ingreso');
    escribir('Nombres', 'Ana');
    escribir('Apellidos', 'Pérez');
    escribir('Número de documento', '1023456789');
    escribir('Teléfono', '3001234567');
    escribir('Fecha de nacimiento', '1990-05-17');
    fireEvent.click(screen.getByRole('button', { name: /Guardar y continuar/ }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'El documento pertenece a otra cuenta',
    );
  });
});

describe('motivosLocales', () => {
  it('con las palabras de la app', () => {
    const m = motivosLocales(
      {
        nombres: '',
        apellidos: ' ',
        tipoDocumento: 'cedula',
        numeroDocumento: '12',
        telefono: '12',
        fechaNacimiento: '',
        correo: '',
      },
      new Date('2026-10-14T15:00:00Z'),
    );
    expect(m).toEqual({
      nombres: 'Escriba sus nombres',
      apellidos: 'Escriba sus apellidos',
      numeroDocumento: 'El documento tiene al menos 4 letras o cifras',
      telefono: 'Escriba un teléfono de 7 a 15 cifras',
      fechaNacimiento: 'Escriba su fecha de nacimiento',
    });
  });
});

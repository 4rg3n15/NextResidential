import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActividadPorVivienda, ordenarFilas, textoDeVivienda } from './actividad-por-vivienda';

/**
 * 15-Z3 (D-Z3) · la actividad por vivienda en Portería y en el tablero: los
 * cinco estados, el orden por actividad o por vivienda, el filtro por torre y
 * el criterio que la API declara, enseñado tal cual.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const FILAS = [
  {
    viviendaId: 'v-302',
    identificador: '302',
    agrupacion: 'Torre 3',
    vehiculosEnVisita: 1,
    visitantesAhora: 2,
  },
  {
    viviendaId: 'v-101',
    identificador: '101',
    agrupacion: 'Torre 1',
    vehiculosEnVisita: 0,
    visitantesAhora: 0,
  },
  {
    viviendaId: 'v-7',
    identificador: 'Casa 7',
    agrupacion: null,
    vehiculosEnVisita: 1,
    visitantesAhora: 1,
  },
];
const RESPUESTA = {
  criterio: 'Visitantes con ingreso sin salida registrada.',
  ahora: '2026-10-14T15:00:00.000Z',
  filas: FILAS,
};

let respuesta: () => Response | Promise<Response> = () => new Response('{}', { status: 200 });
beforeEach(() => {
  respuesta = () =>
    new Response(JSON.stringify(RESPUESTA), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => respuesta()),
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

describe('ActividadPorVivienda · la pantalla', () => {
  it('cargando: lo dice mientras no hay respuesta', () => {
    respuesta = () => new Promise(() => undefined);
    envolver(<ActividadPorVivienda copropiedadId={COP} />);
    expect(screen.getByText(/Cargando actividad por vivienda/i)).toBeTruthy();
  });

  it('con datos: cada vivienda con sus recuentos, más activa primero, y el criterio tal cual', async () => {
    envolver(<ActividadPorVivienda copropiedadId={COP} />);
    const filas = await screen.findAllByRole('row');
    // Cabecera + 3 viviendas; la 302 (2 visitantes) va primero y la 101 (sin actividad) al final.
    expect(filas.map((f) => f.textContent)).toHaveLength(4);
    expect(filas[1]?.textContent).toContain('Torre 3 · 302');
    expect(filas[1]?.textContent).toContain('1 vehículo en visita activa');
    expect(filas[1]?.textContent).toContain('2 visitantes en este momento');
    expect(filas[3]?.textContent).toContain('Torre 1 · 101');
    expect(filas[3]?.textContent).toContain('0 vehículos en visita activa');
    expect(screen.getByText(RESPUESTA.criterio)).toBeTruthy();
  });

  it('se ordena por vivienda y se filtra por torre', async () => {
    envolver(<ActividadPorVivienda copropiedadId={COP} />);
    await screen.findAllByRole('row');
    fireEvent.change(screen.getByLabelText('Orden'), { target: { value: 'vivienda' } });
    let filas = screen.getAllByRole('row');
    expect(filas[1]?.textContent).toContain('Torre 1 · 101');
    expect(filas[3]?.textContent).toContain('Casa 7');
    fireEvent.change(screen.getByLabelText('Torre'), { target: { value: 'Torre 3' } });
    filas = screen.getAllByRole('row');
    expect(filas).toHaveLength(2);
    expect(filas[1]?.textContent).toContain('Torre 3 · 302');
  });

  it('vacío: una copropiedad sin viviendas activas lo dice', async () => {
    respuesta = () =>
      new Response(JSON.stringify({ ...RESPUESTA, filas: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    envolver(<ActividadPorVivienda copropiedadId={COP} />);
    expect(await screen.findByText(/Sin viviendas activas/)).toBeTruthy();
  });

  it('sin permiso: el 403 de la API se enseña como tal, sin reintentar a ciegas', async () => {
    respuesta = () =>
      new Response(JSON.stringify({ estado: 403, mensaje: 'Rol no autorizado' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    envolver(<ActividadPorVivienda copropiedadId={COP} />);
    expect(await screen.findByText(/Sin permiso/)).toBeTruthy();
  });

  it('sin conexión: cuando fetch ni siquiera responde', async () => {
    respuesta = () => Promise.reject(new TypeError('Failed to fetch'));
    envolver(<ActividadPorVivienda copropiedadId={COP} />);
    expect(await screen.findByText(/Sin conexión/)).toBeTruthy();
  });
});

describe('ordenarFilas y textoDeVivienda', () => {
  it('por actividad: visitantes, luego vehículos, luego torre y vivienda; por vivienda: torre y número, sin torre al final', () => {
    expect(ordenarFilas(FILAS, 'actividad').map((f) => f.viviendaId)).toEqual([
      'v-302',
      'v-7',
      'v-101',
    ]);
    expect(ordenarFilas(FILAS, 'vivienda').map((f) => f.viviendaId)).toEqual([
      'v-101',
      'v-302',
      'v-7',
    ]);
  });
  it('nombra la vivienda con su torre cuando la tiene', () => {
    expect(textoDeVivienda(FILAS[0]!)).toBe('Torre 3 · 302');
    expect(textoDeVivienda(FILAS[2]!)).toBe('Casa 7');
  });
});

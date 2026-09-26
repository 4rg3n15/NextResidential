import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PantallaDeResidentes } from './pantalla';

const COP = '10000000-0000-4000-8000-000000000001';
const VIVIENDA = '30000000-0000-4000-8000-000000000042';

const respuestas: Record<string, unknown> = {
  [`/api/ncr/copropiedades/${COP}/residentes/cuentas`]: [
    {
      usuarioId: '00000000-0000-4000-8000-0000000000a1',
      usuario: 'casa42.ana',
      nombre: 'Ana Pérez',
      vivienda: 'B · 42',
      activa: true,
      debeCambiarContrasena: false,
      creadaEn: '2026-09-26T10:00:00.000Z',
    },
    {
      usuarioId: '00000000-0000-4000-8000-0000000000a2',
      usuario: 'casa7.luis',
      nombre: 'Luis Gómez',
      vivienda: null,
      activa: true,
      debeCambiarContrasena: true,
      creadaEn: '2026-09-26T11:00:00.000Z',
    },
  ],
  [`/api/ncr/copropiedades/${COP}/residentes/vehiculos`]: [
    {
      id: '50000000-0000-4000-8000-0000000000c1',
      viviendaId: VIVIENDA,
      vivienda: 'B · 42',
      placa: 'RES123',
      color: 'Gris',
      modelo: 'Mazda 3',
      marca: null,
      tipo: 'automovil',
      registradoEn: '2026-09-26T12:00:00.000Z',
      registradoPor: 'casa42.ana',
      ocupantes: ['Ana Pérez'],
      activo: true,
    },
  ],
  [`/api/ncr/copropiedades/${COP}/padron/viviendas`]: {
    totales: { activas: 1, inactivas: 0 },
    viviendas: [{ id: VIVIENDA, identificador: '42', agrupacion: 'B', estado: 'activo' }],
  },
  [`/api/ncr/copropiedades/${COP}/viviendas/${VIVIENDA}/ocupantes`]: [
    { id: 'p1', numero: 1, libre: false, codigo: null, ocupante: 'Ana Pérez' },
    { id: 'p2', numero: 2, libre: true, codigo: 'ABCD-EFGH', ocupante: null },
  ],
};

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(async (peticion: Request) => {
    const cuerpo =
      peticion.method === 'POST'
        ? { usuarioId: '00000000-0000-4000-8000-0000000000a3' }
        : respuestas[new URL(peticion.url).pathname];
    return new Response(JSON.stringify(cuerpo ?? {}), {
      status: cuerpo === undefined ? 404 : 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

const envolver = (hijo: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {hijo}
  </QueryClientProvider>
);

describe('panel de residentes (15-I)', () => {
  it('lista las cuentas con su vivienda o «Sin vincular», sin correo', async () => {
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    const tabla = await screen.findByRole('table', { name: /Cuentas de residentes/ });
    expect(within(tabla).getByText('Ana Pérez')).toBeTruthy();
    expect(within(tabla).getByText('Sin vincular')).toBeTruthy();
    expect(within(tabla).getByText('Primer ingreso pendiente')).toBeTruthy();
    expect(document.body.textContent).not.toContain('@');
  });

  it('D5 a · muestra los vehículos registrados por residentes con fecha y vivienda', async () => {
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    const tabla = await screen.findByRole('table', {
      name: /Vehículos registrados por residentes/,
    });
    expect(within(tabla).getByText('RES123')).toBeTruthy();
    expect(within(tabla).getByText(/casa42\.ana/)).toBeTruthy();
  });

  it('D6 · al elegir la vivienda enseña los ocupantes y el código de la plaza libre', async () => {
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    const selector = await screen.findByLabelText('Vivienda');
    await waitFor(() => expect(within(selector).getAllByRole('option')).toHaveLength(2));
    fireEvent.change(selector, { target: { value: VIVIENDA } });
    expect(await screen.findByText(/código ABCD-EFGH/)).toBeTruthy();
  });

  it('3.1 · el alta envía usuario y contraseña inicial por la API, sin correo', async () => {
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo residente' }));
    fireEvent.change(screen.getByLabelText(/^Usuario/), { target: { value: 'casa9.eva' } });
    fireEvent.change(screen.getByLabelText(/Contraseña inicial/), {
      target: { value: 'Inicial#2026' },
    });
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Eva Ruiz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dar de alta' }));
    const esAlta = (p: Request): boolean =>
      p.url.endsWith('/residentes/cuentas') && p.method === 'POST';
    await waitFor(() =>
      expect(fetchFalso.mock.calls.some(([p]) => esAlta(p as Request))).toBe(true),
    );
    const llamada = fetchFalso.mock.calls.find(([p]) => esAlta(p as Request));
    const cuerpo = (await (llamada?.[0] as Request).clone().json()) as Record<string, unknown>;
    expect(cuerpo).toEqual({
      usuario: 'casa9.eva',
      contrasenaInicial: 'Inicial#2026',
      nombre: 'Eva Ruiz',
    });
  });
});

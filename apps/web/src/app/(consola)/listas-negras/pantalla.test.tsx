import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PantallaDeListasNegras } from './pantalla';

const COP = '10000000-0000-4000-8000-000000000001';
const VETOS = [
  {
    id: '70000000-0000-4000-8000-000000000001',
    placa: 'XYZ0000',
    personaId: null,
    persona: null,
    documento: null,
    motivo: 'Daños en la talanquera',
    creadoEn: '2026-09-26T12:00:00.000Z',
  },
  {
    id: '70000000-0000-4000-8000-000000000002',
    placa: null,
    personaId: '40000000-0000-4000-8000-000000000099',
    persona: 'Visitante Vetado',
    documento: '1020304050',
    motivo: 'Agresión al portero',
    creadoEn: '2026-09-26T13:00:00.000Z',
  },
];

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(async (peticion: Request) => {
    const cuerpo =
      peticion.method === 'POST'
        ? peticion.url.endsWith('/levantamiento')
          ? { levantado: true }
          : { id: '70000000-0000-4000-8000-000000000003' }
        : VETOS;
    return new Response(JSON.stringify(cuerpo), {
      status: 200,
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

describe('listas negras (HU-35, 15-I)', () => {
  it('lista placas y personas vetadas con su motivo', async () => {
    render(envolver(<PantallaDeListasNegras copropiedadId={COP} puedeLevantar />));
    const tabla = await screen.findByRole('table', { name: /Vetos activos/ });
    expect(within(tabla).getByText('XYZ0000')).toBeTruthy();
    expect(within(tabla).getByText(/Visitante Vetado · 1020304050/)).toBeTruthy();
    expect(within(tabla).getAllByRole('button', { name: 'Levantar' })).toHaveLength(2);
  });

  it('RN-07 · quien no administra ve los vetos pero no puede levantarlos', async () => {
    render(envolver(<PantallaDeListasNegras copropiedadId={COP} puedeLevantar={false} />));
    const tabla = await screen.findByRole('table', { name: /Vetos activos/ });
    expect(within(tabla).queryByRole('button', { name: 'Levantar' })).toBeNull();
  });

  it('vetar una placa envía placa y motivo por la API', async () => {
    render(envolver(<PantallaDeListasNegras copropiedadId={COP} puedeLevantar />));
    fireEvent.click(await screen.findByRole('button', { name: 'Vetar' }));
    const dialogo = screen.getByRole('dialog', { name: 'Vetar' });
    fireEvent.change(within(dialogo).getByLabelText(/^Placa/), { target: { value: 'abc-123' } });
    fireEvent.change(within(dialogo).getByLabelText(/^Motivo/), { target: { value: 'Incidente' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Vetar' }));
    const esVeto = (p: Request): boolean => p.url.endsWith('/listas-negras') && p.method === 'POST';
    await waitFor(() =>
      expect(fetchFalso.mock.calls.some(([p]) => esVeto(p as Request))).toBe(true),
    );
    const llamada = fetchFalso.mock.calls.find(([p]) => esVeto(p as Request));
    const cuerpo = (await (llamada?.[0] as Request).clone().json()) as Record<string, unknown>;
    expect(cuerpo).toEqual({ motivo: 'Incidente', placa: 'abc-123' });
  });
});

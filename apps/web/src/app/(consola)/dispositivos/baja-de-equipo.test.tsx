import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Equipo } from '@ncr/contracts';
import { DialogoDeBajaDeEquipo, EquiposDadosDeBaja, textoDeRostros } from './baja-de-equipo';

const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = '20000000-0000-4000-8000-0000000000c1';

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(
    async () =>
      new Response(JSON.stringify({ id: EQUIPO, nombre: 'Cámara entrada' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

const envolver = (hijo: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {hijo}
  </QueryClientProvider>
);

const peticiones = (): Request[] => fetchFalso.mock.calls.map(([p]) => p as Request);

describe('C4 · dar de baja un equipo = baja lógica con motivo (RN-19)', () => {
  it('sin motivo de 5 caracteres y sin confirmar, el botón no envía nada', async () => {
    const alCerrar = vi.fn();
    render(
      envolver(
        <DialogoDeBajaDeEquipo
          copropiedadId={COP}
          equipo={{ id: EQUIPO, nombre: 'Cámara entrada' }}
          alCerrar={alCerrar}
        />,
      ),
    );
    const dialogo = await screen.findByRole('dialog');
    const enviar = within(dialogo).getByRole('button', { name: 'Dar de baja' });
    expect(enviar.hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la baja/), {
      target: { value: 'x' },
    });
    expect(enviar.hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la baja/), {
      target: { value: 'Se retira por mantenimiento' },
    });
    // Motivo válido pero sin la casilla: sigue sin enviar.
    expect(enviar.hasAttribute('disabled')).toBe(true);
    expect(peticiones()).toHaveLength(0);
  });

  it('con motivo y confirmación envía POST …/equipos/:id/baja con el motivo', async () => {
    const alCerrar = vi.fn();
    const alDarDeBaja = vi.fn();
    render(
      envolver(
        <DialogoDeBajaDeEquipo
          copropiedadId={COP}
          equipo={{ id: EQUIPO, nombre: 'Cámara entrada' }}
          alCerrar={alCerrar}
          alDarDeBaja={alDarDeBaja}
        />,
      ),
    );
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la baja/), {
      target: { value: '  Se retira  por mantenimiento ' },
    });
    fireEvent.click(within(dialogo).getByRole('checkbox'));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }));
    await waitFor(() => expect(peticiones()).toHaveLength(1));
    const p = peticiones()[0] as Request;
    expect(p.method).toBe('POST');
    expect(new URL(p.url).pathname).toBe(`/api/ncr/copropiedades/${COP}/equipos/${EQUIPO}/baja`);
    expect(await p.clone().json()).toEqual({ motivo: 'Se retira por mantenimiento' });
    await waitFor(() => expect(alCerrar).toHaveBeenCalled());
    expect(String(alDarDeBaja.mock.calls[0]?.[0])).toContain('Cámara entrada');
  });

  it('los dados de baja se listan aparte y «Reactivar» llama a …/reactivacion', async () => {
    const equipo = {
      id: EQUIPO,
      nombre: 'Terminal retirada',
      tipo: 'terminal_facial',
      estado: 'inactivo',
    } as unknown as Equipo;
    render(envolver(<EquiposDadosDeBaja copropiedadId={COP} equipos={[equipo]} />));
    const tabla = await screen.findByRole('table', { name: /Equipos dados de baja/ });
    expect(within(tabla).getByText('Terminal retirada')).toBeTruthy();
    expect(within(tabla).getByText('Dado de baja')).toBeTruthy();
    fireEvent.click(within(tabla).getByRole('button', { name: 'Reactivar' }));
    await waitFor(() => expect(peticiones()).toHaveLength(1));
    expect(new URL((peticiones()[0] as Request).url).pathname).toBe(
      `/api/ncr/copropiedades/${COP}/equipos/${EQUIPO}/reactivacion`,
    );
  });
});

describe('C4 (15-M) · lo que pasa con los rostros del equipo dado de baja (RN-11)', () => {
  it('dice cuántos se retiraron y cuántos siguen en el equipo', () => {
    expect(textoDeRostros(0, 0)).toBe('');
    expect(textoDeRostros(3, 0)).toBe(' Se retiraron 3 rostro(s) del equipo.');
    expect(textoDeRostros(2, 1)).toMatch(/Se retiraron 2 .* 1 rostro\(s\) siguen en el equipo/);
  });
});

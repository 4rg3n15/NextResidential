import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DialogoDeBajaDeResidente } from './baja-de-residente';

const COP = '10000000-0000-4000-8000-000000000001';
const USUARIO = '00000000-0000-4000-8000-0000000000a1';

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(
    async () =>
      new Response(JSON.stringify({ dadaDeBaja: true, plantillasSuprimidas: 2 }), {
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

describe('C9 · «eliminar» un residente = baja con motivo (RN-19, CA-02)', () => {
  it('exige motivo de al menos 5 caracteres y la casilla de confirmación', async () => {
    render(
      envolver(
        <DialogoDeBajaDeResidente
          copropiedadId={COP}
          cuenta={{ usuarioId: USUARIO, nombre: 'Ana Pérez' }}
          alCerrar={() => undefined}
        />,
      ),
    );
    const dialogo = await screen.findByRole('dialog');
    const enviar = within(dialogo).getByRole('button', { name: 'Dar de baja' });
    expect(enviar.hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la baja/), {
      target: { value: 'nada' },
    });
    expect(within(dialogo).getByText(/Escribe al menos 5 caracteres/)).toBeTruthy();
    fireEvent.click(within(dialogo).getByRole('checkbox'));
    expect(enviar.hasAttribute('disabled')).toBe(true);
    expect(peticiones()).toHaveLength(0);
  });

  it('envía POST …/residentes/cuentas/:usuarioId/baja con el motivo y cuenta las plantillas', async () => {
    const alCerrar = vi.fn();
    const alDarDeBaja = vi.fn();
    render(
      envolver(
        <DialogoDeBajaDeResidente
          copropiedadId={COP}
          cuenta={{ usuarioId: USUARIO, nombre: 'Ana Pérez' }}
          alCerrar={alCerrar}
          alDarDeBaja={alDarDeBaja}
        />,
      ),
    );
    const dialogo = await screen.findByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText(/Motivo de la baja/), {
      target: { value: 'Se mudó de la copropiedad' },
    });
    fireEvent.click(within(dialogo).getByRole('checkbox'));
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }));
    await waitFor(() => expect(peticiones()).toHaveLength(1));
    const p = peticiones()[0] as Request;
    expect(p.method).toBe('POST');
    expect(new URL(p.url).pathname).toBe(
      `/api/ncr/copropiedades/${COP}/residentes/cuentas/${USUARIO}/baja`,
    );
    expect(await p.clone().json()).toEqual({ motivo: 'Se mudó de la copropiedad' });
    await waitFor(() => expect(alCerrar).toHaveBeenCalled());
    const aviso = String(alDarDeBaja.mock.calls[0]?.[0]);
    expect(aviso).toContain('Ana Pérez');
    expect(aviso).toContain('2 plantilla(s)');
  });
});

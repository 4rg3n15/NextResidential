import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { EstadoDeSesionDePorteria } from '@ncr/contracts';
import { BloqueoDePatrullaje } from './bloqueo-de-patrullaje';

const reemplazar = vi.fn();
const refrescar = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: reemplazar, refresh: refrescar, push: vi.fn() }),
}));

const ESTADO: EstadoDeSesionDePorteria = {
  estado: 'patrullaje',
  codigo: null,
  turnoInicio: '2026-09-26T03:00:00.000Z',
  turnoFin: '2026-09-26T11:00:00.000Z',
  porteria: 'Norte',
  intentosRestantes: 5,
  patrullajeDesde: '2026-09-26T05:00:00.000Z',
  motivoCierre: null,
};

let fetchFalso: ReturnType<typeof vi.fn>;
const responder = (resultado: string): Response =>
  new Response(JSON.stringify({ resultado }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  reemplazar.mockReset();
  refrescar.mockReset();
  fetchFalso = vi.fn(async () => responder('incorrecto'));
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

const teclear = (codigo: string): void => {
  fireEvent.change(screen.getByLabelText('Código de patrullaje'), { target: { value: codigo } });
  fireEvent.click(screen.getByRole('button', { name: 'Volver a la consola' }));
};

describe('pantalla de patrullaje (ADR-024)', () => {
  it('NO muestra el código: se muestra en la consola sólo con la sesión activa', () => {
    render(<BloqueoDePatrullaje estado={ESTADO} />);
    expect(screen.getByRole('heading', { name: 'Patrullaje en curso' })).toBeTruthy();
    expect(screen.queryByText(/\b\d{4}\b/)).toBeNull();
  });

  it('un código equivocado descuenta un intento y lo dice', async () => {
    render(<BloqueoDePatrullaje estado={ESTADO} />);
    teclear('1234');
    await waitFor(() => expect(screen.getByText(/Te quedan 4 intentos/)).toBeTruthy());
    const peticion = fetchFalso.mock.calls[0]?.[0] as Request;
    expect(peticion.url).toContain('/api/ncr/porteria/sesion/desbloqueo');
    expect(JSON.parse(await peticion.clone().text())).toEqual({ codigo: '1234' });
  });

  it('el código correcto refresca la consola: el servidor ya no está en patrullaje', async () => {
    fetchFalso.mockResolvedValueOnce(responder('desbloqueada'));
    render(<BloqueoDePatrullaje estado={ESTADO} />);
    teclear('0427');
    await waitFor(() => expect(refrescar).toHaveBeenCalled());
  });

  it('agotados los intentos, cierra la sesión y vuelve al acceso con el aviso', async () => {
    fetchFalso.mockResolvedValueOnce(responder('agotado'));
    render(<BloqueoDePatrullaje estado={{ ...ESTADO, intentosRestantes: 1 }} />);
    teclear('9999');
    await waitFor(() => expect(reemplazar).toHaveBeenCalledWith('/acceso?aviso=patrullaje'));
    expect(
      fetchFalso.mock.calls.some(
        (c) => c[0] === '/api/sesion' && (c[1] as RequestInit).method === 'DELETE',
      ),
    ).toBe(true);
  });
});

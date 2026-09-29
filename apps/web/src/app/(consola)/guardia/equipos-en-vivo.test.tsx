import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// El video negocia WebRTC contra la API: aquí sólo importa QUÉ equipo recibe.
vi.mock('@/componentes/video-en-vivo', () => ({
  VideoEnVivo: ({ dispositivoId }: { dispositivoId: string }) => (
    <div data-testid="video" data-equipo={dispositivoId} />
  ),
}));

import { EquiposEnVivo } from './equipos-en-vivo';

const COP = '10000000-0000-4000-8000-000000000001';
const CAMARA = '20000000-0000-4000-8000-0000000000c1';
const PORTERO = '20000000-0000-4000-8000-0000000000c2';
const RELE = '20000000-0000-4000-8000-0000000000c3';
const DE_BAJA = '20000000-0000-4000-8000-0000000000c4';

const nombres = [
  { id: CAMARA, nombre: 'Cámara entrada', tipo: 'camara_lpr', activo: true },
  { id: PORTERO, nombre: 'Videoportero torre B', tipo: 'intercom', activo: true },
  { id: RELE, nombre: 'Relé talanquera', tipo: 'rele', activo: true },
  { id: DE_BAJA, nombre: 'Terminal retirada', tipo: 'terminal_facial', activo: false },
];

let fetchFalso: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchFalso = vi.fn(async (peticion: Request) => {
    const url = new URL(peticion.url);
    let cuerpo: unknown = {};
    if (url.pathname.endsWith('/nombres-de-equipos')) cuerpo = nombres;
    else if (url.pathname.endsWith('/eventos/linea-de-tiempo')) {
      cuerpo = {
        elementos: [
          {
            id: 'e1',
            origen: 'equipo',
            tipo: 'timbre',
            titulo: `Timbre en ${url.searchParams.get('dispositivoId') ?? '?'}`,
            dispositivoId: url.searchParams.get('dispositivoId'),
            ocurridoEn: '2026-09-29T10:00:00.000Z',
            enVivo: true,
          },
        ],
      };
    } else if (url.pathname.endsWith('/guardia/ordenes')) {
      cuerpo = {
        id: 'o1',
        accion: 'abrir',
        motivo: 'x',
        operadorId: 'op',
        dispositivoId: PORTERO,
        eventoId: null,
        momento: '2026-09-29T10:01:00.000Z',
        resultado: 'aceptada',
        detalle: null,
      };
    }
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

const llamadasA = (sufijo: string): Request[] =>
  fetchFalso.mock.calls
    .map(([p]) => p as Request)
    .filter((p) => new URL(p.url).pathname.endsWith(sufijo));

describe('C10 · equipos en vivo en la guardia y la portería', () => {
  it('lista sólo los equipos ACTIVOS con cámara: ni el relé ni el dado de baja', async () => {
    render(envolver(<EquiposEnVivo copropiedadId={COP} />));
    const selector = await screen.findByLabelText('Equipo en vivo');
    await waitFor(() => expect(within(selector).getAllByRole('option')).toHaveLength(2));
    const textos = within(selector)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(textos).toEqual(['Cámara entrada', 'Videoportero torre B']);
  });

  it('la llamada PROPONE su equipo y el operador puede cambiarlo: el video sigue al elegido', async () => {
    const { rerender } = render(envolver(<EquiposEnVivo copropiedadId={COP} />));
    await waitFor(() =>
      expect(screen.getByTestId('video').getAttribute('data-equipo')).toBe(CAMARA),
    );
    rerender(envolver(<EquiposEnVivo copropiedadId={COP} propuesto={PORTERO} />));
    await waitFor(() =>
      expect(screen.getByTestId('video').getAttribute('data-equipo')).toBe(PORTERO),
    );
    fireEvent.change(screen.getByLabelText('Equipo en vivo'), { target: { value: CAMARA } });
    expect(screen.getByTestId('video').getAttribute('data-equipo')).toBe(CAMARA);
  });

  it('la línea de tiempo se pide con el dispositivoId del equipo elegido', async () => {
    render(envolver(<EquiposEnVivo copropiedadId={COP} propuesto={PORTERO} />));
    await screen.findByText(`Timbre en ${PORTERO}`);
    fireEvent.change(screen.getByLabelText('Equipo en vivo'), { target: { value: CAMARA } });
    await screen.findByText(`Timbre en ${CAMARA}`);
    const pedidas = llamadasA('/eventos/linea-de-tiempo').map((p) =>
      new URL(p.url).searchParams.get('dispositivoId'),
    );
    expect(pedidas).toContain(PORTERO);
    expect(pedidas).toContain(CAMARA);
  });

  it('«Abrir este equipo» exige motivo y manda la orden auditada con ese equipo', async () => {
    render(envolver(<EquiposEnVivo copropiedadId={COP} propuesto={PORTERO} />));
    const selector = await screen.findByLabelText('Equipo en vivo');
    await waitFor(() => expect(within(selector).getAllByRole('option')).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: /Abrir este equipo/ }));
    const dialogo = await screen.findByRole('dialog');
    // Sin motivo, el botón de confirmar no actúa.
    const confirmar = within(dialogo).getByRole('button', { name: 'Abrir' });
    expect(confirmar.hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialogo).getByRole('textbox'), {
      target: { value: 'La vivienda confirma la visita por el intercom' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Abrir' }));
    await waitFor(() => expect(llamadasA('/guardia/ordenes')).toHaveLength(1));
    const cuerpo = (await llamadasA('/guardia/ordenes')[0]?.clone().json()) as Record<
      string,
      unknown
    >;
    expect(cuerpo).toMatchObject({
      dispositivoId: PORTERO,
      accion: 'abrir',
      motivo: 'La vivienda confirma la visita por el intercom',
    });
    expect(await screen.findByRole('status')).toBeTruthy();
  });
});

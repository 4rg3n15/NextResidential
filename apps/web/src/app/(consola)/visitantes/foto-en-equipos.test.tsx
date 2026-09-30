import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Visita } from '@ncr/contracts';
import { FotoEnEquipos } from './pantalla';

/**
 * R1 (15-N) · el estado de la foto equipo por equipo distingue «la tiene»,
 * «no la aceptó», «pendiente» y «omitido» (con el porqué), y «Enviar a equipos
 * pendientes» pide sólo a los que no la tienen.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const PLANTILLA = '30000000-0000-4000-8000-000000000001';

const visita = {
  autorizacionId: '40000000-0000-4000-8000-000000000001',
  plantillaId: PLANTILLA,
  estado: 'vigente',
  equiposFallidos: 0,
} as unknown as Visita;

let pedidas: Request[] = [];
beforeEach(() => {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (p: Request) => {
      pedidas.push(p);
      const cuerpo = new URL(p.url).pathname.endsWith('/equipos')
        ? [
            {
              dispositivoId: 'd1',
              equipo: 'Terminal peatonal',
              estado: 'sincronizada',
              detalle: null,
              intentos: 1,
              actualizadoEn: '2026-09-30T12:00:00Z',
            },
            {
              dispositivoId: 'd2',
              equipo: 'Videoportero torre B',
              estado: 'omitida',
              detalle: 'aún no se sabe si admite rostros: use «Probar conexión» en su ficha',
              intentos: 0,
              actualizadoEn: '2026-09-30T12:00:00Z',
            },
            {
              dispositivoId: 'd3',
              equipo: 'Terminal vehicular',
              estado: 'pendiente',
              detalle: null,
              intentos: 0,
              actualizadoEn: '2026-09-30T12:00:00Z',
            },
          ]
        : {
            plantillaId: PLANTILLA,
            terminales: 1,
            sincronizadas: 1,
            fallidas: 0,
            porTerminal: [],
            omitidas: [],
          };
      return new Response(JSON.stringify(cuerpo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('R1 · la foto de la visita, equipo por equipo', () => {
  it('omitido con su porqué, pendiente, y el envío sólo a pendientes', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <FotoEnEquipos copropiedadId={COP} visita={visita} />
      </QueryClientProvider>,
    );
    await screen.findByText('Omitido');
    expect(screen.getByText('La tiene')).toBeTruthy();
    expect(screen.getByText('Pendiente')).toBeTruthy();
    expect(screen.getByText(/aún no se sabe si admite rostros/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar a equipos pendientes' }));
    await waitFor(() => expect(pedidas.some((p) => p.method === 'POST')).toBe(true));
    const post = pedidas.find((p) => p.method === 'POST');
    expect(new URL(post?.url ?? '').searchParams.get('soloPendientes')).toBe('true');
    await screen.findByText('Enviada a 1 de 1 equipos.');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PreferenciasDeAtencionEditables } from './preferencias-de-atencion';

const COP = '10000000-0000-4000-8000-000000000001';
const TODAS = {
  llamada: { abrir: true, sonar: true },
  rostro: { abrir: true, sonar: true },
  placa: { abrir: true, sonar: true },
  lista_negra: { abrir: true, sonar: true },
  dudoso: { abrir: true, sonar: true },
};

let enviados: unknown[] = [];
beforeEach(() => {
  enviados = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (peticion: Request) => {
      if (peticion.method === 'PUT') enviados.push(await peticion.json());
      return new Response(JSON.stringify(enviados.at(-1) ?? TODAS), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('G2 · preferencias de atención en Configuración', () => {
  it('apagar el sonido de la placa envía las cinco, con sólo ése cambiado', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <PreferenciasDeAtencionEditables copropiedadId={COP} />
      </QueryClientProvider>,
    );
    const casilla = await screen.findByLabelText('Placa sin autorización: suena');
    expect((casilla as HTMLInputElement).checked).toBe(true);
    fireEvent.click(casilla);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar avisos' }));
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]).toEqual({ ...TODAS, placa: { abrir: true, sonar: false } });
    await screen.findByText(/Guardado/);
  });
});

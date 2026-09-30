import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { AlertaExpuesta } from '@ncr/contracts';
import { AlertasAbiertas } from './alertas-abiertas';

const COP = '10000000-0000-4000-8000-000000000001';
const CAMARA = '20000000-0000-4000-8000-0000000000c1';

const alerta = (id: string, extra: Partial<AlertaExpuesta> = {}): AlertaExpuesta => ({
  id,
  tipo: 'acceso_dudoso',
  severidad: 'alta',
  estado: 'abierta',
  generadaEn: '2026-09-28T14:05:00.000Z',
  escaladaEn: null,
  eventoId: null,
  dispositivoId: CAMARA,
  escaladaDentroDelPlazo: null,
  notas: '[camara_decide_sola] La cámara decidió por su cuenta',
  ...extra,
});

let pedidas: Request[] = [];
beforeEach(() => {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (p: Request) => {
      pedidas.push(p);
      const cuerpo =
        p.method === 'GET' ? [alerta('a1'), alerta('a2')] : { archivadas: 2, omitidas: 0 };
      return new Response(JSON.stringify(cuerpo), {
        status: p.method === 'GET' ? 200 : 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const envolver = (hijo: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {hijo}
  </QueryClientProvider>
);

const montar = () =>
  render(
    envolver(
      <AlertasAbiertas
        copropiedadId={COP}
        nombreDe={() => 'Cámara de entrada'}
        equipos={[{ id: CAMARA, nombre: 'Cámara de entrada' }]}
      />,
    ),
  );

describe('E5 / C7 (15-M) · la cola de alertas: filtros y archivo con motivo', () => {
  it('lista con el equipo por nombre y la fecha en DD-MM-YYYY', async () => {
    montar();
    expect(await screen.findAllByText(/Cámara de entrada ·/)).toHaveLength(2);
    expect(screen.getAllByText(/28-09-2026/).length).toBeGreaterThan(0);
  });

  it('filtrar por equipo y por severidad va en la consulta', async () => {
    montar();
    await screen.findAllByText(/Cámara de entrada ·/);
    fireEvent.change(screen.getByLabelText('Filtrar alertas por equipo'), {
      target: { value: CAMARA },
    });
    fireEvent.change(screen.getByLabelText('Filtrar alertas por severidad'), {
      target: { value: 'alta' },
    });
    await waitFor(() =>
      expect(
        pedidas.some(
          (p) => p.url.includes(`dispositivoId=${CAMARA}`) && p.url.includes('severidad=alta'),
        ),
      ).toBe(true),
    );
  });

  it('sin motivo no se archiva; con motivo, en lote, por POST …/alertas/archivar', async () => {
    montar();
    await screen.findAllByText(/Cámara de entrada ·/);
    const casillas = screen.getAllByRole('checkbox', {
      name: /Marcar la alerta acceso dudoso de Cámara de entrada/,
    });
    expect(casillas).toHaveLength(2);
    fireEvent.click(casillas[0] as HTMLElement);
    fireEvent.click(casillas[1] as HTMLElement);
    const botonLote = screen.getByRole('button', { name: /Archivar 2 marcada/ });
    expect((botonLote as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText(/Obligatorio/), {
      target: { value: 'ruido de la cámara sin atestación' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Archivar 2 marcada/ }));
    await waitFor(() => expect(pedidas.some((p) => p.method === 'POST')).toBe(true));
    const post = pedidas.find((p) => p.method === 'POST') as Request;
    expect(post.url).toMatch(/\/alertas\/archivar$/);
    expect(await post.clone().json()).toEqual({
      ids: ['a1', 'a2'],
      motivo: 'ruido de la cámara sin atestación',
    });
    expect(await screen.findByText(/archivada\(s\) con motivo; ninguna se borra/)).toBeTruthy();
  });
});

describe('A2 (15-N) · seleccionar todas las visibles, archivar en lote y filtrar por fecha', () => {
  it('«Seleccionar todas las visibles» marca las dos y el lote las archiva con UN motivo', async () => {
    montar();
    const boton = await screen.findByRole('button', { name: 'Seleccionar todas las visibles (2)' });
    fireEvent.click(boton);
    fireEvent.change(screen.getByPlaceholderText(/Obligatorio/), {
      target: { value: 'ruido de la cámara del 28/09' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Archivar 2 marcada(s)' }));
    await waitFor(() => expect(pedidas.some((p) => p.method === 'POST')).toBe(true));
    const post = pedidas.find((p) => p.method === 'POST');
    expect(new URL(post?.url ?? '').pathname).toMatch(/\/alertas\/archivar$/);
    expect(await post?.json()).toEqual({
      ids: ['a1', 'a2'],
      motivo: 'ruido de la cámara del 28/09',
    });
  });

  it('las fechas viajan como [inicio del día desde, inicio del día siguiente a hasta)', async () => {
    montar();
    await screen.findByRole('button', { name: /Seleccionar todas las visibles/ });
    fireEvent.change(screen.getByLabelText('Alertas generadas desde el día'), {
      target: { value: '2026-09-28' },
    });
    fireEvent.change(screen.getByLabelText('Alertas generadas hasta el día (incluido)'), {
      target: { value: '2026-09-29' },
    });
    await waitFor(() =>
      expect(
        pedidas.some((p) => {
          const q = new URL(p.url).searchParams;
          return q.has('desde') && q.has('hasta');
        }),
      ).toBe(true),
    );
    const q = new URL(
      pedidas.filter((p) => new URL(p.url).searchParams.has('hasta')).at(-1)?.url ?? '',
    ).searchParams;
    expect(q.get('desde')).toBe(new Date(2026, 8, 28).toISOString());
    expect(q.get('hasta')).toBe(new Date(2026, 8, 30).toISOString());
  });
});

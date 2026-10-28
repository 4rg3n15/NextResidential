import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Rol } from '@ncr/contracts';
import { PantallaDeEventos } from './pantalla';

/**
 * D-146 · decisión del cliente (27/10): el portero, igual que la
 * administración, PUEDE consultar, buscar y filtrar eventos anteriores. Su
 * vista sigue arrancando limpia cada día; el corte del día y el de «Limpiar»
 * sólo aplican a esa vista, nunca a una búsqueda. «Borrar filtros» lo devuelve
 * a su día. Corrige el portero de sólo-hoy de D-145.
 *
 * Reloj: 22:30 del 25/10 en Bogotá (03:30 del 26/10 en UTC).
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-26T03:30:00.000Z');
const INICIO_25 = '2026-10-25T05:00:00.000Z';
const HACE_3_DIAS_LOCAL = '2026-10-22T00:00';
const HACE_3_DIAS = '2026-10-22T05:00:00.000Z';

let lineas: URL[] = [];
let metodos: string[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  lineas = [];
  metodos = [];
  window.localStorage.clear();
  window.history.replaceState(null, '', '/eventos');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (p: Request) => {
      const url = new URL(p.url);
      metodos.push(p.method);
      if (url.pathname.endsWith('/linea-de-tiempo')) lineas.push(url);
      const cuerpo = url.pathname.endsWith('/linea-de-tiempo') ? { elementos: [] } : [];
      return new Response(JSON.stringify(cuerpo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const montada = async (rol: Rol = 'portero'): Promise<void> => {
  const clientes = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const envolver = (hijo: ReactNode) => (
    <QueryClientProvider client={clientes}>{hijo}</QueryClientProvider>
  );
  render(envolver(<PantallaDeEventos copropiedadId={COP} rol={rol} />));
  await waitFor(() => expect(lineas.length).toBeGreaterThan(0));
};

const desdePedido = (): string | null => lineas.at(-1)?.searchParams.get('desde') ?? null;
const campoDesde = (): HTMLInputElement => {
  const [desde] = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'),
  );
  if (desde === undefined) throw new Error('sin campo Desde');
  return desde;
};

describe('D-146 · el portero busca días anteriores; su vista sigue arrancando limpia', () => {
  it('sin filtros: su día de Bogotá, con «Limpiar» y el aviso nuevo', async () => {
    await montada();
    expect(desdePedido()).toBe(INICIO_25);
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeDefined();
    expect(
      screen.getByText(
        /Limpia sólo la vista de hoy\. Para ver días anteriores, use las fechas y los filtros/,
      ),
    ).toBeDefined();
  });

  it('con Desde de hace 3 días ve esos días: se piden, sin corte del día', async () => {
    await montada();
    await screen.findByText('Nada todavía');
    fireEvent.change(campoDesde(), { target: { value: HACE_3_DIAS_LOCAL } });
    await waitFor(() => expect(desdePedido()).toBe(HACE_3_DIAS));
    // Buscando, ni «Limpiar» ni el aviso del día: no aplican a una búsqueda.
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull();
    expect(screen.getByText('Sin eventos en el rango')).toBeDefined();
  });

  it('«Limpiar» no recorta una búsqueda', async () => {
    await montada();
    await screen.findByText('Nada todavía');
    vi.setSystemTime(new Date('2026-10-26T03:45:00.000Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(desdePedido()).toBe('2026-10-26T03:45:00.000Z'));
    fireEvent.change(campoDesde(), { target: { value: HACE_3_DIAS_LOCAL } });
    await waitFor(() => expect(desdePedido()).toBe(HACE_3_DIAS));
  });

  it('«Borrar filtros» lo devuelve a su vista del día, con su «Limpiar» guardado', async () => {
    window.localStorage.setItem(`ncr.eventos.limpiadoEn.${COP}`, '2026-10-26T03:00:00.000Z');
    await montada();
    await waitFor(() => expect(desdePedido()).toBe('2026-10-26T03:00:00.000Z'));
    fireEvent.change(screen.getByLabelText('Placa'), { target: { value: 'abc-123' } });
    await waitFor(() => expect(lineas.at(-1)?.searchParams.get('placa')).toBe('ABC123'));
    // Una placa sin fechas busca como la administración: los últimos 7 días.
    expect(desdePedido()).toBe('2026-10-18T05:00:00.000Z');
    fireEvent.click(screen.getByRole('button', { name: 'Borrar filtros' }));
    await waitFor(() => expect(desdePedido()).toBe('2026-10-26T03:00:00.000Z'));
    expect(lineas.at(-1)?.searchParams.has('placa')).toBe(false);
    expect(screen.getByRole('button', { name: 'Limpiar' })).toBeDefined();
  });

  it('la administración, sin cambios: sin «Limpiar» y 7 días por omisión', async () => {
    await montada('administrador');
    expect(desdePedido()).toBe('2026-10-18T05:00:00.000Z');
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull();
  });

  it('nada de esto escribe: todas las peticiones son GET (RN-03, eventos append-only)', async () => {
    await montada();
    await screen.findByText('Nada todavía');
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    fireEvent.change(campoDesde(), { target: { value: HACE_3_DIAS_LOCAL } });
    await waitFor(() => expect(desdePedido()).toBe(HACE_3_DIAS));
    expect(metodos.length).toBeGreaterThan(0);
    expect(metodos.every((m) => m === 'GET')).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useCuentasDeResidentes,
  useVehiculosDeResidentes,
} from '@/app/(consola)/residentes/consultas';
import { INTERVALO_DE_LISTAS_COMPARTIDAS_MS } from './recarga';
import { useVehiculos } from './consultas';
import { useVisitas } from './visitas';

/**
 * 3h (corrección de la 15-L) · lo que el residente cambia en la app aparece en
 * la consola sin recargar la página: las listas compartidas se vuelven a pedir
 * solas cada 15 s y al recuperar el foco de la ventana.
 */
const COP = '10000000-0000-4000-8000-000000000001';

const envoltura = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
  >
    {children}
  </QueryClientProvider>
);

const pedidasA = (fetch: ReturnType<typeof vi.fn>, fragmento: string): number =>
  fetch.mock.calls.filter(([entrada]) =>
    String(typeof entrada === 'string' ? entrada : (entrada as Request).url).includes(fragmento),
  ).length;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const CASOS: readonly (readonly [string, string, () => unknown])[] = [
  [
    'Visitantes',
    '/visitas',
    () => useVisitas(COP, { viviendaId: '', desde: '', hasta: '', estado: '', texto: '' }),
  ],
  ['Residentes', '/residentes/cuentas', () => useCuentasDeResidentes(COP)],
  ['Vehículos de residentes', '/residentes/vehiculos', () => useVehiculosDeResidentes(COP)],
  ['Vehículos', '/padron/vehiculos', () => useVehiculos(COP)],
];

describe('3h · las listas que comparten app y consola se recargan solas', () => {
  it.each(CASOS)(
    '%s: una petición más cada 15 s, sin que nadie recargue',
    async (_n, fragmento, gancho) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const fetch = vi.fn(async (entrada: string | Request) => {
        const url = String(typeof entrada === 'string' ? entrada : entrada.url);
        const cuerpo = url.includes('/visitas')
          ? { soloElDia: false, desde: null, hasta: null, visitas: [] }
          : [];
        return new Response(JSON.stringify(cuerpo), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
      vi.stubGlobal('fetch', fetch);
      renderHook(gancho, { wrapper: envoltura });
      await waitFor(() => expect(pedidasA(fetch, fragmento)).toBe(1));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(INTERVALO_DE_LISTAS_COMPARTIDAS_MS + 50);
      });
      await waitFor(() => expect(pedidasA(fetch, fragmento)).toBe(2));
    },
  );
});

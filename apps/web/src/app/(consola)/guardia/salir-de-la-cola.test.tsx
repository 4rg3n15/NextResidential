import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Ni video ni audio reales: aquí sólo importa qué pide la pantalla al canal.
vi.mock('@/componentes/video-en-vivo', () => ({ VideoEnVivo: () => null }));
vi.mock('@/componentes/controles-de-audio', () => ({ ControlesDeAudio: () => null }));

import { PantallaDeGuardiaVirtual } from './pantalla';

/**
 * Otros fallos (15-M) · «Salir de la cola» SUELTA el puesto en la cola del
 * canal de audio. Antes volvía a pedir el canal (`intercom/abrir`), que con el
 * operador ya en cola no hacía nada: seguía esperando y, al llegarle el turno,
 * retenía el canal exclusivo 90 s sin nadie hablando.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const PORTERO = '20000000-0000-4000-8000-0000000000c2';

let estadoDelCanal: 'abierta' | 'en_espera' | 'cerrada' = 'en_espera';
let fetchFalso: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchFalso = vi.fn(async (peticion: Request) => {
    const ruta = new URL(peticion.url).pathname;
    let cuerpo: unknown = {};
    if (ruta.endsWith('/guardia/cola')) {
      cuerpo = {
        cola: [
          {
            eventoId: 'e1',
            ocurridoEn: '2026-09-29T10:00:00.000Z',
            motivo: 'VIGENCIA_EXPIRADA',
            resultado: 'negado',
            dispositivoId: PORTERO,
            viviendaId: null,
            placaDetectada: null,
            esperaSegundos: 30,
            urgencia: 'normal',
            demorado: false,
          },
        ],
        total: 1,
        criticos: 0,
        esperaMaxima: 30,
      };
    } else if (ruta.includes('/guardia/intercom/') && peticion.method === 'GET') {
      cuerpo = {
        dispositivoId: PORTERO,
        estado: estadoDelCanal,
        porDelante: estadoDelCanal === 'en_espera' ? 1 : 0,
        titular: 'otro-operador',
        timeoutSegundos: 90,
        transporte: 'ninguno',
      };
    } else if (ruta.endsWith('/nombres-de-equipos')) {
      cuerpo = [];
    } else if (ruta.endsWith('/eventos/linea-de-tiempo')) {
      cuerpo = { elementos: [] };
    }
    return new Response(JSON.stringify(cuerpo), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const envolver = (hijo: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {hijo}
  </QueryClientProvider>
);

const pedidasA = (sufijo: string): Request[] =>
  fetchFalso.mock.calls
    .map(([p]) => p as Request)
    .filter((p) => new URL(p.url).pathname.endsWith(sufijo));

describe('guardia · el turno del canal de audio (otros fallos, 15-M)', () => {
  it('en cola, «Salir de la cola» pide CERRAR, no volver a abrir', async () => {
    estadoDelCanal = 'en_espera';
    render(envolver(<PantallaDeGuardiaVirtual copropiedadId={COP} nombreDeCopropiedad="Prueba" />));
    fireEvent.click(await screen.findByRole('button', { name: /salir de la cola/i }));
    await waitFor(() => expect(pedidasA('/guardia/intercom/cerrar')).toHaveLength(1));
    expect(pedidasA('/guardia/intercom/abrir')).toHaveLength(0);
    const cuerpo = (await pedidasA('/guardia/intercom/cerrar')[0]?.json()) as {
      dispositivoId: string;
    };
    expect(cuerpo.dispositivoId).toBe(PORTERO);
  });

  it('con la palabra, «Colgar» también cierra', async () => {
    estadoDelCanal = 'abierta';
    render(envolver(<PantallaDeGuardiaVirtual copropiedadId={COP} nombreDeCopropiedad="Prueba" />));
    fireEvent.click(await screen.findByRole('button', { name: /colgar/i }));
    await waitFor(() => expect(pedidasA('/guardia/intercom/cerrar')).toHaveLength(1));
  });
});

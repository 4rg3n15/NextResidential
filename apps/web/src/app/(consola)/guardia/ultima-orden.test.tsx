import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EnAtencion } from '@ncr/contracts';
import type * as ModuloWhep from '@/lib/video/whep';

/**
 * 15-N · LO QUE CONTESTÓ EL EQUIPO NO SE VA CON EL ELEMENTO ATENDIDO
 *
 * Con P-22, una orden atiende al elemento y lo saca de la cola; la tarjeta de
 * «Atención» se vacía. «Última orden: …» vivía DENTRO de esa tarjeta, así que
 * el operador dejaba de ver si el equipo aceptó o RECHAZÓ (O1) justo cuando
 * más lo necesita. El recorrido de la consola lo vio en Chromium.
 */
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/lib/video/whep', async (original) => ({
  ...(await original<typeof ModuloWhep>()),
  negociarVistaEnVivo: () => new Promise<never>(() => undefined),
}));

import { PantallaDeGuardiaVirtual } from './pantalla';

const COP = '10000000-0000-4000-8000-000000000001';
const CAMARA = '20000000-0000-4000-8000-0000000000c1';

const placa: EnAtencion = {
  eventoId: 'e-1',
  origen: 'acceso',
  disparador: 'placa',
  titulo: 'Placa no autorizada',
  ocurridoEn: '2026-09-30T12:00:00.000Z',
  motivo: 'PLACA_DESCONOCIDA',
  resultado: 'negado',
  dispositivoId: CAMARA,
  viviendaId: null,
  placaDetectada: 'ABC123',
  conEvidencia: false,
  esperaSegundos: 5,
  urgencia: 'normal',
  demorado: false,
};

let cola: EnAtencion[] = [];

beforeEach(() => {
  cola = [placa];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (peticion: Request) => {
      const url = new URL(peticion.url);
      let cuerpo: unknown = {};
      if (url.pathname.endsWith('/guardia/ordenes') && peticion.method === 'POST') {
        cola = []; // atendido: sale de la cola
        return new Response(
          JSON.stringify({
            id: 'o-1',
            accion: 'abrir',
            resultado: 'rechazada',
            detalle: 'El equipo no aceptó la orden (HTTP 200)',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.pathname.endsWith('/guardia/cola')) {
        cuerpo = {
          cola,
          total: cola.length,
          criticos: 0,
          esperaMaxima: 5,
          vigenciaSegundos: 300,
          preferencias: {
            llamada: { abrir: true, sonar: false },
            rostro: { abrir: true, sonar: false },
            placa: { abrir: true, sonar: false },
            lista_negra: { abrir: true, sonar: false },
            dudoso: { abrir: true, sonar: false },
          },
        };
      } else if (url.pathname.endsWith('/nombres-de-equipos')) {
        cuerpo = [{ id: CAMARA, nombre: 'Cámara', tipo: 'camara_lpr', activo: true }];
      } else if (url.pathname.endsWith('/eventos/linea-de-tiempo')) cuerpo = { elementos: [] };
      else if (url.pathname.endsWith('/guardia/ordenes')) cuerpo = { ordenes: [] };
      return new Response(JSON.stringify(cuerpo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('la última orden sigue a la vista cuando el elemento sale de la cola', () => {
  it('«Rechazada por el equipo» se ve aunque la Atención quede vacía', async () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <PantallaDeGuardiaVirtual copropiedadId={COP} nombreDeCopropiedad="A" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Abrir con motivo' }));
    fireEvent.change(document.querySelector('textarea#motivo')!, {
      target: { value: 'Visitante confirmado por la vivienda' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir', exact: true } as never));
    await screen.findByText('Nadie seleccionado');
    await waitFor(() =>
      expect(screen.getByText(/Última orden: Rechazada por el equipo/)).toBeTruthy(),
    );
  });
});

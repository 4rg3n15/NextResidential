import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EnAtencion } from '@ncr/contracts';
import type * as ModuloWhep from '@/lib/video/whep';

/**
 * O3 (15-N) · DT-15M-05 · «Avisar al residente» va a nombre del EQUIPO que se
 * atiende y de SU vivienda. Antes, sin vivienda, mandaba la copropiedad como
 * si fuera una vivienda, y la API guardaba la vivienda en el campo del equipo.
 */
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/lib/video/whep', async (original) => ({
  ...(await original<typeof ModuloWhep>()),
  negociarVistaEnVivo: () => new Promise<never>(() => undefined),
}));

import { PantallaDeGuardiaVirtual } from './pantalla';

const COP = '10000000-0000-4000-8000-000000000001';
const PORTERO = '20000000-0000-4000-8000-0000000000c2';
const VIVIENDA = '40000000-0000-4000-8000-0000000000b1';

const llamada = (viviendaId: string | null): EnAtencion => ({
  eventoId: 'e-1',
  origen: 'equipo',
  disparador: 'llamada',
  titulo: 'Llamada entrante',
  ocurridoEn: '2026-09-30T12:00:00.000Z',
  motivo: null,
  resultado: null,
  dispositivoId: PORTERO,
  viviendaId,
  placaDetectada: null,
  conEvidencia: false,
  esperaSegundos: 5,
  urgencia: 'normal',
  demorado: false,
});

let cola: EnAtencion[] = [];
const avisos: unknown[] = [];

beforeEach(() => {
  avisos.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (peticion: Request) => {
      const url = new URL(peticion.url);
      let cuerpo: unknown = {};
      if (url.pathname.endsWith('/guardia/avisar-residente')) {
        avisos.push(await peticion.clone().json());
        return new Response(JSON.stringify({ aceptado: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
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
        cuerpo = [{ id: PORTERO, nombre: 'Videoportero', tipo: 'intercom', activo: true }];
      } else if (url.pathname.endsWith('/eventos/linea-de-tiempo')) cuerpo = { elementos: [] };
      else if (url.pathname.includes('/guardia/intercom/')) {
        cuerpo = { estado: 'libre', porDelante: 0, timeoutSegundos: 90 };
      }
      return new Response(JSON.stringify(cuerpo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const montar = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <PantallaDeGuardiaVirtual copropiedadId={COP} nombreDeCopropiedad="A" />
    </QueryClientProvider>,
  );

describe('O3 · el aviso al residente', () => {
  it('lleva la vivienda Y el equipo que se atiende', async () => {
    cola = [llamada(VIVIENDA)];
    montar();
    const boton = await screen.findByRole('button', { name: /Avisar al residente/ });
    fireEvent.click(boton);
    await waitFor(() => expect(avisos).toHaveLength(1));
    expect(avisos[0]).toMatchObject({ viviendaId: VIVIENDA, dispositivoId: PORTERO });
  });

  it('sin vivienda no se puede avisar: nunca manda la copropiedad como vivienda', async () => {
    cola = [llamada(null)];
    montar();
    const boton = await screen.findByRole('button', { name: /Avisar al residente/ });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(boton);
    await new Promise((r) => setTimeout(r, 50));
    expect(avisos).toEqual([]);
  });
});

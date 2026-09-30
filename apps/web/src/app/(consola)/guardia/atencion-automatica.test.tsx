import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { EnAtencion } from '@ncr/contracts';
import type * as ModuloWhep from '@/lib/video/whep';

/**
 * G4 (15-N) · LA GUARDIA QUE SE ABRE SOLA, PROBADA EN PANTALLA
 *
 *  · con un elemento de cada disparador, la «Atención» pasa sola a ESE
 *    elemento, el selector de video cambia a SU equipo y la vista pide el WHEP
 *    de ese equipo, sin ningún clic;
 *  · dos seguidos: el segundo queda en cola con su contador y no le quita la
 *    pantalla al primero, aunque llegue delante (crítico);
 *  · cola vacía (un histórico no entra en ella, lo prueba la API): no se abre
 *    nada ni se pide video de nadie en particular.
 */
// La primera prueba carga la pantalla entera (consola, video, audio): más de 5 s en frío.
vi.setConfig({ testTimeout: 20_000 });

const negociar = vi.fn((_url: string) => new Promise<never>(() => undefined));
vi.mock('@/lib/video/whep', async (original) => ({
  ...(await original<typeof ModuloWhep>()),
  negociarVistaEnVivo: (url: string) => negociar(url),
}));

import { PantallaDeGuardiaVirtual } from './pantalla';
import { rutaWhep } from '@/lib/video/whep';

const COP = '10000000-0000-4000-8000-000000000001';
const CAMARA = '20000000-0000-4000-8000-0000000000c1';
const PORTERO = '20000000-0000-4000-8000-0000000000c2';
const TERMINAL = '20000000-0000-4000-8000-0000000000c3';

const nombres = [
  { id: CAMARA, nombre: 'Cámara entrada', tipo: 'camara_lpr', activo: true },
  { id: PORTERO, nombre: 'Videoportero torre B', tipo: 'intercom', activo: true },
  { id: TERMINAL, nombre: 'Terminal peatonal', tipo: 'terminal_facial', activo: true },
];

const elemento = (
  eventoId: string,
  disparador: EnAtencion['disparador'],
  dispositivoId: string,
  urgencia: EnAtencion['urgencia'] = 'normal',
): EnAtencion => ({
  eventoId,
  origen: disparador === 'llamada' ? 'equipo' : 'acceso',
  disparador,
  titulo: `Título ${eventoId}`,
  ocurridoEn: '2026-09-30T12:00:00.000Z',
  motivo: disparador === 'llamada' ? null : 'PLACA_DESCONOCIDA',
  resultado: disparador === 'llamada' ? null : 'negado',
  dispositivoId,
  viviendaId: null,
  placaDetectada: null,
  conEvidencia: false,
  esperaSegundos: 12,
  urgencia,
  demorado: false,
});

let colaActual: EnAtencion[] = [];

beforeEach(() => {
  negociar.mockClear();
  colaActual = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (peticion: Request) => {
      const url = new URL(peticion.url);
      let cuerpo: unknown = {};
      if (url.pathname.endsWith('/guardia/cola')) {
        cuerpo = {
          cola: colaActual,
          total: colaActual.length,
          criticos: colaActual.filter((e) => e.urgencia === 'critica').length,
          esperaMaxima: 12,
          vigenciaSegundos: 300,
          preferencias: {
            llamada: { abrir: true, sonar: true },
            rostro: { abrir: true, sonar: true },
            placa: { abrir: true, sonar: true },
            lista_negra: { abrir: true, sonar: true },
            dudoso: { abrir: true, sonar: true },
          },
        };
      } else if (url.pathname.endsWith('/nombres-de-equipos')) cuerpo = nombres;
      else if (url.pathname.endsWith('/eventos/linea-de-tiempo')) cuerpo = { elementos: [] };
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

const montar = (consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } })) => {
  const envolver = (hijo: ReactNode) => (
    <QueryClientProvider client={consultas}>{hijo}</QueryClientProvider>
  );
  return {
    consultas,
    ...render(envolver(<PantallaDeGuardiaVirtual copropiedadId={COP} nombreDeCopropiedad="A" />)),
  };
};

const ultimoWhep = (): string | undefined => negociar.mock.calls.at(-1)?.[0];

describe('G4 · un elemento de cada tipo abre SU equipo, sin clic', () => {
  it.each([
    ['llamada', PORTERO],
    ['rostro', TERMINAL],
    ['placa', CAMARA],
    ['lista_negra', CAMARA],
    ['dudoso', TERMINAL],
  ] as const)('%s → «Atención» y WHEP del equipo que lo emitió', async (disparador, equipo) => {
    colaActual = [elemento('e-1', disparador, equipo)];
    montar();
    await screen.findAllByText('Título e-1');
    await waitFor(() => expect(ultimoWhep()).toBe(rutaWhep(COP, equipo)));
    expect((screen.getByLabelText('Equipo en vivo') as HTMLSelectElement).value).toBe(equipo);
  });
});

describe('G4 · dos seguidos: el segundo espera', () => {
  it('no le quita la pantalla al primero aunque llegue delante, y la cola lo cuenta', async () => {
    colaActual = [elemento('primero', 'llamada', PORTERO)];
    const { consultas } = montar();
    await waitFor(() => expect(ultimoWhep()).toBe(rutaWhep(COP, PORTERO)));

    // Llega una lista negra en la cámara: crítica, la cola la pone delante.
    colaActual = [elemento('segundo', 'lista_negra', CAMARA, 'critica'), ...colaActual];
    await consultas.invalidateQueries({ queryKey: ['guardia', COP, 'cola'] });
    await screen.findByText(/1 en cola mientras atiendes/);
    // Sigue en «Atención» el primero, y el video sigue en SU equipo.
    expect(screen.getAllByText('Título primero').length).toBeGreaterThan(0);
    expect(ultimoWhep()).toBe(rutaWhep(COP, PORTERO));
    expect((screen.getByLabelText('Equipo en vivo') as HTMLSelectElement).value).toBe(PORTERO);
  });

  it('atendido el primero (sale de la cola), el segundo pasa solo', async () => {
    colaActual = [elemento('primero', 'llamada', PORTERO), elemento('segundo', 'placa', CAMARA)];
    const { consultas } = montar();
    await waitFor(() => expect(ultimoWhep()).toBe(rutaWhep(COP, PORTERO)));
    colaActual = [elemento('segundo', 'placa', CAMARA)];
    await consultas.invalidateQueries({ queryKey: ['guardia', COP, 'cola'] });
    await waitFor(() => expect(ultimoWhep()).toBe(rutaWhep(COP, CAMARA)));
  });
});

describe('G4 · cola vacía', () => {
  it('no abre nada: «Nadie seleccionado»', async () => {
    montar();
    await screen.findByText('Nadie seleccionado');
    await screen.findByText('Sin nadie en cola');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EnAtencion, PuntoDeAcceso } from '@ncr/contracts';
import type * as ModuloWhep from '@/lib/video/whep';
import { faltaElegirPunto, puntoDeLaOrden } from './selector-de-punto';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3/P5 · EL PUNTO DE ACCESO EN EL PANEL DE GUARDIA
 *
 * Sobre la pantalla entera, con la API fingida en `fetch`: el selector vive
 * dentro del bloque abrir/denegar del mockup; con dos cerraduras no se abre
 * sin elegir; la orden lleva el punto; y los estados —cargando, vacío, sin
 * permiso, sin conexión— se dicen en palabras.
 * ═════════════════════════════════════════════════════════════════════════════
 */
vi.setConfig({ testTimeout: 20_000 });
vi.mock('@/lib/video/whep', async (original) => ({
  ...(await original<typeof ModuloWhep>()),
  negociarVistaEnVivo: () => new Promise<never>(() => undefined),
}));

import { PantallaDeGuardiaVirtual } from './pantalla';

const COP = '10000000-0000-4000-8000-000000000001';
const PORTERO = '70000000-0000-4000-8000-000000000001';

const llamada: EnAtencion = {
  eventoId: 'e-1',
  origen: 'equipo',
  disparador: 'llamada',
  titulo: 'Llamada desde el videoportero',
  ocurridoEn: '2026-10-01T12:00:00.000Z',
  motivo: null,
  resultado: null,
  dispositivoId: PORTERO,
  viviendaId: null,
  placaDetectada: null,
  conEvidencia: false,
  esperaSegundos: 3,
  urgencia: 'normal',
  demorado: false,
};

const punto = (n: number, nombre: string): PuntoDeAcceso => ({
  id: `p-${String(n)}`,
  dispositivoId: PORTERO,
  nombre,
  numeroDePuerta: n,
  modulo: 'Salidas del equipo',
  rutaEnElEquipo: `equipo/propio/puerta-${String(n)}`,
  origen: 'descubierto',
  descubiertoEn: '2026-10-01T11:00:00.000Z',
});

let respuestaDePuntos: () => Response;
let ordenes: unknown[] = [];

const json = (cuerpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  ordenes = [];
  respuestaDePuntos = () =>
    json({ puntos: [punto(1, 'Cerradura 1'), punto(2, 'Portón vehicular')] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (peticion: Request) => {
      const url = new URL(peticion.url);
      if (url.pathname.endsWith(`/equipos/${PORTERO}/puntos`)) return respuestaDePuntos();
      if (url.pathname.endsWith('/guardia/ordenes') && peticion.method === 'POST') {
        const cuerpo = (await peticion.json()) as Record<string, unknown>;
        ordenes.push(cuerpo);
        return json(
          {
            id: 'o-1',
            accion: 'abrir',
            resultado: 'aceptada',
            detalle: null,
            punto: { id: cuerpo['puntoId'], nombre: 'Portón vehicular', numeroDePuerta: 2 },
          },
          201,
        );
      }
      if (url.pathname.endsWith('/guardia/cola')) {
        return json({
          cola: [llamada],
          total: 1,
          criticos: 0,
          esperaMaxima: 3,
          vigenciaSegundos: 300,
          preferencias: {
            llamada: { abrir: true, sonar: false },
            rostro: { abrir: true, sonar: false },
            placa: { abrir: true, sonar: false },
            lista_negra: { abrir: true, sonar: false },
            dudoso: { abrir: true, sonar: false },
          },
        });
      }
      if (url.pathname.endsWith('/nombres-de-equipos')) {
        return json([{ id: PORTERO, nombre: 'Videoportero', tipo: 'intercom', activo: true }]);
      }
      if (url.pathname.endsWith('/eventos/linea-de-tiempo')) return json({ elementos: [] });
      if (url.pathname.endsWith('/guardia/ordenes')) return json({ ordenes: [] });
      return json({});
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

describe('selector de punto · dentro del bloque abrir/denegar', () => {
  it('con dos cerraduras NO se abre sin elegir; elegida, la orden lleva su punto', async () => {
    montar();
    const portón = await screen.findByRole('radio', { name: /Portón vehicular/ });
    const abrir = screen.getByRole('button', { name: 'Abrir con motivo' });
    expect(abrir.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('group', { name: 'Punto de acceso' })).toBeTruthy();
    fireEvent.click(portón);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Abrir Portón vehicular con motivo' }),
    );
    expect(await screen.findByText('Abrir · Portón vehicular')).toBeTruthy();
    fireEvent.change(document.querySelector('textarea#motivo')!, {
      target: { value: 'Visitante confirmado por la vivienda' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir', exact: true } as never));
    await waitFor(() => expect(ordenes).toHaveLength(1));
    expect(ordenes[0]).toMatchObject({ dispositivoId: PORTERO, accion: 'abrir', puntoId: 'p-2' });
  });

  it('sin puntos descubiertos: lo dice y abre la puerta de la ficha (sin puntoId)', async () => {
    respuestaDePuntos = () => json({ puntos: [] });
    montar();
    expect(await screen.findByText(/no tiene puntos de acceso descubiertos/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir con motivo' }));
    fireEvent.change(document.querySelector('textarea#motivo')!, {
      target: { value: 'Visitante confirmado por la vivienda' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Abrir', exact: true } as never));
    await waitFor(() => expect(ordenes).toHaveLength(1));
    expect(ordenes[0]).not.toHaveProperty('puntoId');
  });

  it('sin permiso y sin conexión se dicen en palabras, con reintento', async () => {
    respuestaDePuntos = () => json({ estado: 403, correlacion: 'x', mensaje: 'Prohibido' }, 403);
    const { unmount } = montar();
    expect(
      (await screen.findByText(/Tu rol no ve los puntos/)).closest('[role="alert"]'),
    ).toBeTruthy();
    unmount();
    respuestaDePuntos = () => {
      throw new TypeError('Failed to fetch');
    };
    montar();
    expect(await screen.findByText(/Sin conexión con la API/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
});

describe('puntoDeLaOrden · la regla, sin pantalla', () => {
  const dos = [punto(1, 'Cerradura 1'), punto(2, 'Cerradura 2')];
  it('uno solo se usa sin elegir; con varios, el elegido; un elegido ajeno no vale', () => {
    expect(puntoDeLaOrden([punto(1, 'Única')], null)).toEqual({ id: 'p-1', nombre: 'Única' });
    expect(puntoDeLaOrden(dos, null)).toBeNull();
    expect(faltaElegirPunto(dos, null)).toBe(true);
    expect(puntoDeLaOrden(dos, { id: 'p-2', nombre: 'Cerradura 2' })?.id).toBe('p-2');
    expect(puntoDeLaOrden(dos, { id: 'p-de-otro-equipo', nombre: 'x' })).toBeNull();
    expect(faltaElegirPunto([], null)).toBe(false);
  });
});

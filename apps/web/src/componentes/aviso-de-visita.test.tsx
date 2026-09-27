import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Visita } from '@ncr/contracts';
import { AvisoDeVisita } from './aviso-de-visita';
import type { abrirCanal } from '@/lib/sse/canal';
import type { AvisoDeVisitaEnVivo } from '@/lib/sse/visitas';
import { esAvisoDeVisita } from '@/lib/sse/visitas';

const COP = '10000000-0000-4000-8000-000000000001';

const visita = (extra: Partial<Visita> = {}): Visita => ({
  autorizacionId: 'a0000000-0000-4000-8000-000000000001',
  visitante: 'Ana Pérez',
  documento: 'CC123',
  viviendaId: 'viv-1',
  vivienda: 'Casa 12',
  desde: '2026-09-27T15:00:00.000Z',
  hasta: '2026-09-27T17:00:00.000Z',
  estado: 'vigente',
  placa: null,
  generadaPor: 'Residente Casa 12',
  generadaEn: '2026-09-27T14:55:00.000Z',
  anuladaEn: null,
  motivoAnulacion: null,
  tieneFoto: true,
  casillaDeclaradaPor: 'Residente Casa 12',
  casillaEn: '2026-09-27T14:55:00.000Z',
  plantillaId: 'p-1',
  consentimientoId: 'c-1',
  confirmadoPorElTitular: false,
  equiposSincronizados: 2,
  equiposFallidos: 0,
  ...extra,
});

const montar = () => {
  let entregar: ((a: AvisoDeVisitaEnVivo) => void) | undefined;
  const baja = vi.fn();
  const suscribir = vi.fn(((opciones) => {
    entregar = opciones.mensajes.visita;
    return baja;
  }) as typeof abrirCanal);
  const consultas = new QueryClient();
  const vista = render(
    <QueryClientProvider client={consultas}>
      <AvisoDeVisita copropiedadId={COP} suscribir={suscribir} />
    </QueryClientProvider>,
  );
  return {
    entregar: (a: AvisoDeVisitaEnVivo) => act(() => entregar?.(a)),
    baja,
    vista,
  };
};

let peticiones: Request[] = [];
beforeEach(() => {
  peticiones = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: Request) => {
      peticiones.push(entrada);
      return new Response(JSON.stringify({ equiposRetirados: 2, equiposPendientes: 0 }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('AvisoDeVisita (F2)', () => {
  it('sin aviso no pinta nada; con una visita nueva, el aviso con vivienda y visitante', () => {
    const { entregar } = montar();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    entregar({ tipo: 'nueva', visita: visita() });
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText(/Nueva visita para Casa 12/)).toBeTruthy();
    expect(screen.getByText(/Ana Pérez/)).toBeTruthy();
    expect(screen.getByText(/Ya está autorizada/)).toBeTruthy();
  });

  it('«Rechazar» pide el motivo y envía el rechazo de ESA visita', async () => {
    const { entregar } = montar();
    entregar({ tipo: 'nueva', visita: visita() });
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: 'El residente no espera a nadie' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar visita' }));
    await waitFor(() => expect(peticiones.length).toBe(1));
    const r = peticiones[0]!;
    expect(r.method).toBe('POST');
    expect(new URL(r.url).pathname).toMatch(
      /\/copropiedades\/[^/]+\/visitas\/a0000000-0000-4000-8000-000000000001\/rechazo$/,
    );
    expect(await r.clone().json()).toEqual({ motivo: 'El residente no espera a nadie' });
    await waitFor(() => expect(screen.getByText(/La foto salió de 2 equipos/)).toBeTruthy());
  });

  it('si la misma visita se anula en otra consola, el aviso se retira solo', () => {
    const { entregar } = montar();
    entregar({ tipo: 'nueva', visita: visita() });
    entregar({ tipo: 'anulada', visita: visita({ estado: 'anulada' }) });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('una visita vencida no ofrece «Rechazar»', () => {
    const { entregar } = montar();
    entregar({ tipo: 'nueva', visita: visita({ estado: 'vencida' }) });
    expect(screen.queryByRole('button', { name: 'Rechazar' })).toBeNull();
  });

  it('el canal sólo acepta la forma completa del aviso', () => {
    expect(esAvisoDeVisita({ tipo: 'nueva', visita: visita() })).toBe(true);
    expect(esAvisoDeVisita({ tipo: 'otra', visita: visita() })).toBe(false);
    expect(esAvisoDeVisita({ tipo: 'nueva', visita: { visitante: 'x' } })).toBe(false);
    expect(esAvisoDeVisita(null)).toBe(false);
  });

  it('al desmontar se da de baja del canal', () => {
    const { baja, vista } = montar();
    vista.unmount();
    expect(baja).toHaveBeenCalledTimes(1);
  });
});

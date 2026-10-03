import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FranjaDePuertas } from './franja-de-puertas';
import { ModoDeLaPuerta } from '@/app/(consola)/dispositivos/modo-de-la-puerta';

/**
 * 15-R · P-25 · C4 · la consola dice qué puerta está libre o bloqueada —quién,
 * por qué, desde y hasta cuándo— y la administración la revierte; y la ficha
 * del equipo la deja libre o bloqueada con motivo y plazo.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = '70000000-0000-4000-8000-000000000001';
const VIGENTE = {
  id: 'm-1',
  dispositivoId: EQUIPO,
  numeroDePuerta: 2,
  modo: 'libre',
  motivo: 'Mudanza del 302',
  operadorId: 'u-1',
  operadorNombre: 'Ana Admin',
  rol: 'administrador',
  desde: '2026-10-03T17:00:00.000Z',
  revierteEn: '2026-10-03T19:00:00.000Z',
  resultado: 'aceptada',
  reversionesFallidas: 0,
};

let peticiones: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
let modos: unknown[] = [];
beforeEach(() => {
  peticiones = [];
  modos = [VIGENTE];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (p: Request) => {
      const ruta = new URL(p.url).pathname.replace('/api/ncr', '');
      const cuerpo: unknown = p.method === 'GET' ? null : await p.clone().json();
      peticiones.push({ metodo: p.method, ruta, cuerpo });
      if (p.method === 'POST' && ruta.endsWith('/modos/reversion')) modos = [];
      const datos = p.method === 'GET' ? { modos } : { id: 'x', resultado: 'aceptada' };
      return new Response(JSON.stringify(datos), {
        status: p.method === 'GET' ? 200 : 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const envolver = (nodo: JSX.Element) =>
  render(<QueryClientProvider client={new QueryClient()}>{nodo}</QueryClientProvider>);

describe('15-R · franja de puertas libres o bloqueadas', () => {
  it('el portero ve quién, por qué, desde y hasta cuándo, pero no revierte', async () => {
    envolver(<FranjaDePuertas copropiedadId={COP} rol="portero" />);
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toMatch(/Puerta 2 LIBRE/);
    expect(alerta.textContent).toMatch(/Ana Admin/);
    expect(alerta.textContent).toMatch(/«Mudanza del 302»/);
    expect(alerta.textContent).toMatch(/Vuelve sola a normal/);
    expect(screen.queryByRole('button', { name: 'Revertir ahora' })).toBeNull();
  });

  it('la administración revierte ahora y la franja desaparece', async () => {
    envolver(<FranjaDePuertas copropiedadId={COP} rol="administrador" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revertir ahora' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(peticiones).toContainEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/puertas/modos/reversion`,
      cuerpo: { dispositivoId: EQUIPO, numeroDePuerta: 2 },
    });
  });

  it('al residente no se le pregunta nada ni se le muestra', () => {
    envolver(<FranjaDePuertas copropiedadId={COP} rol="residente" />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(peticiones).toEqual([]);
  });
});

describe('15-R · dejar una puerta libre o bloqueada desde la ficha', () => {
  it('pide motivo, envía el modo, la puerta y el plazo elegido', async () => {
    envolver(
      <ModoDeLaPuerta
        copropiedadId={COP}
        equipoId={EQUIPO}
        puntos={[{ id: 'p-2', numeroDePuerta: 2, nombre: 'Peatonal' } as never]}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    const confirmar = screen.getAllByRole('button', { name: 'Bloquear' }).at(-1) as HTMLElement;
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Motivo'), {
      target: { value: 'Fumigación del lobby' },
    });
    fireEvent.click(confirmar);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(peticiones).toContainEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/puertas/modos`,
      cuerpo: {
        dispositivoId: EQUIPO,
        numeroDePuerta: 2,
        modo: 'bloqueada',
        motivo: 'Fumigación del lobby',
        minutos: 60,
      },
    });
  });
});

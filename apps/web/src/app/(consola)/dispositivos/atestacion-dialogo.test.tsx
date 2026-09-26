import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Equipo } from '@ncr/contracts';
import { DialogoDeAtestacion, distintivoDeAtestacion } from './atestacion-dialogo';

/**
 * D-11 · la atestación en la consola: nunca verde, y el diálogo sólo envía lo
 * que el instalador probó —dos placas, «ninguna abrió» y lo que vio—.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const ATESTACION = {
  id: 'a-1',
  firmware: 'V5.3.0',
  placaEnListaBlanca: 'ABC123',
  placaDesconocida: 'XYZ987',
  evidencia: 'Carril 1: dos pasadas, el brazo no subió.',
  registradaEn: '2026-09-26T15:00:00.000Z',
  registradaPor: 'super-1',
  vigente: true,
  motivoSinEfecto: null,
};
const CAMARA = {
  id: 'eq-1',
  nombre: 'Cámara de la entrada',
  tipo: 'camara_lpr',
  firmware: 'V5.3.0',
  atestacion: null,
} as unknown as Equipo;

describe('D-11 · distintivoDeAtestacion', () => {
  it('vigente es ÁMBAR, nunca verde', () => {
    expect(distintivoDeAtestacion({ atestacion: ATESTACION })).toEqual({
      tono: 'aviso',
      texto: 'Operada por atestación del instalador · firmware V5.3.0',
    });
  });

  it('sin efecto es rojo y dice por qué', () => {
    const d = distintivoDeAtestacion({
      atestacion: { ...ATESTACION, vigente: false, motivoSinEfecto: 'el firmware cambió' },
    });
    expect(d?.tono).toBe('peligro');
    expect(d?.texto).toMatch(/el firmware cambió/);
  });

  it('sin atestación no hay distintivo', () => {
    expect(distintivoDeAtestacion({ atestacion: null })).toBeNull();
  });
});

describe('D-11 · DialogoDeAtestacion', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(ATESTACION), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    // jsdom no implementa <dialog>.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  );

  it('no envía sin «ninguna abrió»; con todo, envía y avisa que sigue en ámbar', async () => {
    const alAtestar = vi.fn();
    render(
      <Envoltura>
        <DialogoDeAtestacion
          copropiedadId={COP}
          equipo={CAMARA}
          alCerrar={() => undefined}
          alAtestar={alAtestar}
        />
      </Envoltura>,
    );
    fireEvent.change(screen.getByLabelText('Placa de la lista blanca del equipo'), {
      target: { value: 'ABC123' },
    });
    fireEvent.change(screen.getByLabelText('Placa desconocida'), { target: { value: 'XYZ987' } });
    fireEvent.change(screen.getByLabelText(/Lo que vio/), {
      target: { value: 'Carril 1: dos pasadas, el brazo no subió.' },
    });
    const enviar = screen.getByRole('button', { name: 'Registrar atestación', hidden: true });
    expect((enviar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { hidden: true }));
    expect((enviar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enviar);

    await waitFor(() => expect(alAtestar).toHaveBeenCalled());
    expect(String(alAtestar.mock.calls[0]?.[0])).toMatch(/ámbar/);
    const espia = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const peticion = espia.mock.calls[0]?.[0] as Request;
    expect(new URL(peticion.url).pathname).toMatch(/\/equipos\/eq-1\/atestacion$/);
    expect(await peticion.clone().json()).toEqual({
      placaEnListaBlanca: 'ABC123',
      placaDesconocida: 'XYZ987',
      ningunaAbrio: true,
      evidencia: 'Carril 1: dos pasadas, el brazo no subió.',
    });
  });
});

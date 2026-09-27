import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GenerarAutorizacion } from './generar-autorizacion';

/**
 * F1 · F4 (15-L) · «Generar autorización»: el cuerpo EXACTO que envía, y que
 * sin foto o sin casilla no se envía nada. La cámara se sustituye por un doble
 * que entrega una foto que ya pasó la calidad: medirla es asunto de
 * `lib/biometria`, que tiene sus propias pruebas.
 */
vi.mock('@/componentes/captura-de-foto', () => ({
  CapturaDeFoto: ({ alCambiar }: { alCambiar: (f: unknown) => void }): JSX.Element => (
    <button
      type="button"
      onClick={() =>
        alCambiar({
          contenidoBase64: '/9j/4AAQSkZJRgABAQ==',
          tipoMime: 'image/jpeg',
          medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
        })
      }
    >
      Tomar foto
    </button>
  ),
}));

const COP = '10000000-0000-4000-8000-000000000001';
const VIVIENDA = '30000000-0000-4000-8000-000000000042';

let enviados: Request[] = [];
let respuesta: unknown = {
  generada: true,
  autorizacionId: 'a0000000-0000-4000-8000-000000000009',
  motivosDeFoto: [],
  equipos: 3,
  sincronizadas: 2,
  fallidas: 1,
  porEquipo: [
    { dispositivoId: 'd1', nombre: 'Terminal gimnasio', sincronizada: true, detalle: 'ok' },
    { dispositivoId: 'd2', nombre: 'Videoportero', sincronizada: false, detalle: 'no respondió' },
  ],
  avisoDeSincronizacion: null,
};

const json = (cuerpo: unknown, estado = 200): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  enviados = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: Request) => {
      const ruta = new URL(entrada.url).pathname;
      if (entrada.method === 'GET' && ruta.endsWith('/visitas/viviendas')) {
        return json([{ id: VIVIENDA, nombre: 'Casa 42' }]);
      }
      if (entrada.method === 'GET' && ruta.endsWith('/visitas/casilla')) {
        return json({
          texto: 'El visitante autorizó el uso de su foto para el ingreso',
          version: 'casilla-1',
        });
      }
      enviados.push(entrada);
      return json(respuesta, 201);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const montar = (): void => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <GenerarAutorizacion copropiedadId={COP} abierto alCerrar={() => undefined} />
    </QueryClientProvider>,
  );
};

const enviar = (): HTMLButtonElement =>
  screen.getByRole('dialog').querySelector<HTMLButtonElement>('button[type="submit"]')!;

const rellenar = async (): Promise<void> => {
  fireEvent.change(screen.getByLabelText(/Nombre del visitante/), {
    target: { value: 'Ana Pérez' },
  });
  fireEvent.change(screen.getByLabelText(/Número de documento/), {
    target: { value: '52.123.456' },
  });
  await screen.findByRole('option', { name: 'Casa 42' });
  fireEvent.change(screen.getByLabelText(/Vivienda que visita/), { target: { value: VIVIENDA } });
  fireEvent.change(screen.getByLabelText(/Fecha de la visita/), {
    target: { value: '2026-10-01' },
  });
  fireEvent.change(screen.getByLabelText(/Hora de llegada/), { target: { value: '15:30' } });
};

describe('Generar autorización (F1, F4)', () => {
  it('sin foto no se envía, y sin la casilla tampoco', async () => {
    montar();
    await rellenar();
    expect(enviar().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));
    expect(enviar().disabled, 'sin la casilla marcada no se envía').toBe(true);
    fireEvent.click(screen.getByLabelText(/El visitante autorizó el uso de su foto/));
    expect(enviar().disabled).toBe(false);
  });

  it('envía nombre, documento, vivienda de la lista, inicio, duración, foto y casilla', async () => {
    montar();
    await rellenar();
    fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));
    fireEvent.click(screen.getByLabelText(/El visitante autorizó el uso de su foto/));
    fireEvent.click(enviar());
    await waitFor(() => expect(enviados.length).toBe(1));
    const r = enviados[0]!;
    expect(new URL(r.url).pathname).toMatch(/\/copropiedades\/[^/]+\/visitas$/);
    const cuerpo = (await r.clone().json()) as Record<string, unknown>;
    expect(cuerpo).toMatchObject({
      nombre: 'Ana Pérez',
      tipoDocumento: 'cedula',
      documento: '52.123.456',
      viviendaId: VIVIENDA,
      duracionMinutos: 120,
      casillaMarcada: true,
      placa: null,
      foto: { tipoMime: 'image/jpeg' },
    });
    expect(cuerpo['inicio']).toBe(new Date('2026-10-01T15:30:00').toISOString());
    // F3 · al volver, cuántos equipos la tienen y cuál no.
    expect(
      await screen.findByText(/Foto enviada a 2 de 3 equipos; 1 no la aceptaron/),
    ).toBeTruthy();
    expect(screen.getByText(/Videoportero: no respondió/)).toBeTruthy();
  });

  it('una foto que el servidor rechaza se dice con palabras, sin códigos', async () => {
    respuesta = {
      generada: false,
      autorizacionId: null,
      motivosDeFoto: ['ROSTROS_MULTIPLES'],
      equipos: 0,
      sincronizadas: 0,
      fallidas: 0,
      porEquipo: [],
      avisoDeSincronizacion: null,
    };
    montar();
    await rellenar();
    fireEvent.click(screen.getByRole('button', { name: 'Tomar foto' }));
    fireEvent.click(screen.getByLabelText(/El visitante autorizó el uso de su foto/));
    fireEvent.click(enviar());
    const alerta = await screen.findByText(/La foto no sirve: se ve más de un rostro/);
    expect(alerta.textContent).not.toMatch(/ROSTROS_MULTIPLES/);
  });
});

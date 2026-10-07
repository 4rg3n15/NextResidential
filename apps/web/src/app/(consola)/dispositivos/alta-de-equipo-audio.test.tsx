import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AltaDeEquipo } from './alta-de-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CORRECCIÓN 15-S1 · A.2 Y B.1 · LA CASILLA ES UNA ATESTACIÓN, Y LA TERMINAL LA TIENE
 *
 * H-15S1-C07: el equipo declara su canal con `enabled=false` y no deja
 * escribirlo; la casilla ya no dice «una persona lo habilitó en el aparato»
 * (no hay dónde), sino «comprobé en sitio que el equipo abre el canal». B: la
 * guardia habla también por la terminal facial, así que la terminal la tiene.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const COP = '10000000-0000-4000-8000-000000000001';
const ATESTACION = /comprobé en sitio que el equipo abre el canal de audio/i;

const respuesta = (cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const equipo = (tipo: 'terminal_facial' | 'intercom' | 'camara_lpr') => ({
  id: '20000000-0000-4000-8000-000000000011',
  nombre: 'Equipo de la entrada',
  tipo,
  modelo: null,
  firmware: null,
  canalBarrera: tipo === 'camara_lpr' ? 1 : null,
  numeroDePuerta: tipo === 'camara_lpr' ? null : 1,
  canalDeAudio: tipo === 'intercom' ? 1 : null,
  fabricante: null,
  modoDeTerminal: tipo === 'terminal_facial' ? 'reporta_y_espera' : null,
  canalDeAudioHabilitado: false,
  canalDeVideo: '101',
  zonaId: null,
  capacidades: null,
  verificacion: 'verificado',
  verificadoEn: null,
  motivoNoVerificado: null,
  estado: 'activo',
  atestacion: null,
  sondeadoEn: null,
  identidadLeidaEn: null,
});

const editar = (e: ReturnType<typeof equipo>) =>
  render(
    <Envoltura>
      <AltaDeEquipo copropiedadId={COP} abierto alCerrar={() => undefined} equipo={e as never} />
    </Envoltura>,
  );

const cuerpoDeLaEdicion = async (): Promise<Record<string, unknown>> => {
  fireEvent.click(
    screen.getByRole('dialog').querySelector<HTMLButtonElement>('button[type="submit"]')!,
  );
  const espia = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  let edicion: Request | undefined;
  await waitFor(() => {
    edicion = (espia.mock.calls as [Request][]).map(([r]) => r).find((r) => r.method === 'PUT');
    expect(edicion).toBeDefined();
  });
  return (await edicion!.clone().json()) as Record<string, unknown>;
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: Request) =>
      entrada.url.endsWith('/zonas') ? respuesta([]) : respuesta({ id: 'ok' }),
    ),
  );
});

describe('15-S1 · la casilla de atestación del audio', () => {
  it('B.1 · la TERMINAL facial la tiene, y marcada viaja en la edición', async () => {
    editar(equipo('terminal_facial'));
    const casilla = screen.getByLabelText(ATESTACION) as HTMLInputElement;
    expect(casilla.checked).toBe(false);
    fireEvent.click(casilla);
    expect(await cuerpoDeLaEdicion()).toMatchObject({ canalDeAudioHabilitado: true });
  });

  it('A.2 · el videoportero, con el texto de la atestación y no el de «habilitar en el aparato»', () => {
    editar(equipo('intercom'));
    expect(screen.getByLabelText(ATESTACION)).toBeTruthy();
    expect(screen.queryByText(/habilitó el canal de audio EN EL APARATO/)).toBeNull();
  });

  it('una cámara no habla con la guardia: ni casilla ni campo en la edición', async () => {
    editar(equipo('camara_lpr'));
    expect(screen.queryByLabelText(ATESTACION)).toBeNull();
    expect(await cuerpoDeLaEdicion()).not.toHaveProperty('canalDeAudioHabilitado');
  });
});

import type { JSX, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RespaldosDiarios } from './respaldos-diarios';

/**
 * D-147 · la sección «Respaldos diarios» de Informes: lista con el estado del
 * envío, descarga por URL firmada pedida al pulsar, y nada que escriba.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const URL_FIRMADA = 'https://proyecto.ejemplo.test/storage/v1/object/sign/x?token=t';

const respuesta = (cuerpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });

const RESPALDO = (fecha: string, estadoDelEnvio: string, ultimoError: string | null = null) => ({
  fecha,
  numeroDeEventos: 12,
  permitidos: 9,
  negados: 3,
  sha256: 'a'.repeat(64),
  tamanoBytes: 2048,
  generadoEn: `${fecha}T05:15:00.000Z`,
  estadoDelEnvio,
  enviadosA: estadoDelEnvio === 'enviado' ? 1 : 0,
  ultimoError,
});

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const servidor = (lista: unknown[]) =>
  vi.fn(async (entrada: string | Request) => {
    const p = typeof entrada === 'string' ? new Request(entrada) : entrada;
    const ruta = new URL(p.url).pathname;
    if (ruta.endsWith('/respaldos')) return respuesta(lista);
    if (ruta.endsWith('/descarga')) return respuesta({ url: URL_FIRMADA, segundosDeVida: 300 });
    return respuesta({ estado: 404, mensaje: 'no' }, 404);
  });

afterEach(() => vi.unstubAllGlobals());

describe('Respaldos diarios (D-147)', () => {
  it('lista cada día con sus eventos y el estado del envío', async () => {
    vi.stubGlobal(
      'fetch',
      servidor([
        RESPALDO('2026-10-27', 'enviado'),
        RESPALDO('2026-10-26', 'error', 'buzón [dirección] lleno'),
        RESPALDO('2026-10-25', 'sin_configurar'),
      ]),
    );
    render(<RespaldosDiarios copropiedadId={COP} />, { wrapper: Envoltura });
    await waitFor(() => expect(screen.getByText('2026-10-27')).toBeTruthy());
    expect(screen.getByText('Enviado')).toBeTruthy();
    expect(screen.getByText('Falló · se reintenta')).toBeTruthy();
    expect(screen.getByText('buzón [dirección] lleno')).toBeTruthy();
    expect(screen.getByText('Correo sin configurar')).toBeTruthy();
    expect(screen.getAllByText('9 permitidos · 3 negados')).toHaveLength(3);
  });

  it('sin respaldos, lo dice y recuerda que el histórico sigue en «Eventos»', async () => {
    vi.stubGlobal('fetch', servidor([]));
    render(<RespaldosDiarios copropiedadId={COP} />, { wrapper: Envoltura });
    await waitFor(() => expect(screen.getByText('Aún no hay respaldos')).toBeTruthy());
    expect(screen.getByText(/El histórico completo sigue en «Eventos»/)).toBeTruthy();
  });

  it('«Descargar» pide la URL firmada al pulsar, la abre, y nada escribe', async () => {
    const espia = servidor([RESPALDO('2026-10-27', 'enviado')]);
    vi.stubGlobal('fetch', espia);
    const asignar = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign: asignar });
    render(<RespaldosDiarios copropiedadId={COP} />, { wrapper: Envoltura });
    const boton = await screen.findByRole('button', {
      name: 'Descargar el respaldo del 2026-10-27',
    });
    expect(
      espia.mock.calls.some(([e]) => String((e as Request).url ?? e).includes('/descarga')),
    ).toBe(false);
    fireEvent.click(boton);
    await waitFor(() => expect(asignar).toHaveBeenCalledWith(URL_FIRMADA));
    const rutas = espia.mock.calls.map(([e]) => {
      const p = typeof e === 'string' ? new Request(e) : (e as Request);
      return `${p.method} ${new URL(p.url).pathname}`;
    });
    expect(
      rutas.some((r) => r.endsWith(`/copropiedades/${COP}/respaldos/2026-10-27/descarga`)),
    ).toBe(true);
    expect(rutas.every((r) => r.startsWith('GET '))).toBe(true);
  });

  it('un 403 se presenta como «Sin permiso»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respuesta({ estado: 403, mensaje: 'no' }, 403)),
    );
    render(<RespaldosDiarios copropiedadId={COP} />, { wrapper: Envoltura });
    await waitFor(() => expect(screen.getByText('Sin permiso')).toBeTruthy());
  });
});

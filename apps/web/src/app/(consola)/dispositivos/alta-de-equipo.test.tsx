import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AltaDeEquipo } from './alta-de-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-01 · LA CÁMARA QUE DECIDE SOLA SE GUARDA «RECHAZADA», NO «SIN VERIFICAR»
 *
 * En sitio, el 26/09/2026, la cámara no quedó registrada como rechazada. Tras
 * «Probar conexión», guardar enviaba `probarConexion: false`: el servidor no
 * sondeaba y el estado caía en `no_verificado`. El estado lo fija el SERVIDOR
 * con su propio sondeo —nunca se toma del navegador—, así que guardar vuelve a
 * sondear salvo tras un rechazo de credencial (reintentarlo bloquea la cuenta).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const COP = '10000000-0000-4000-8000-000000000001';

const respuesta = (cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const sondeo = (clase: string) => ({
  clase,
  detalle: `resultado ${clase}`,
  modelo: null,
  firmware: null,
  latenciaMs: 10,
  verificado: clase === 'alcanzado',
});

const servidor = (clase: string): ReturnType<typeof vi.fn> =>
  vi.fn(async (entrada: Request) => {
    if (entrada.url.includes('/prueba-de-conexion')) return respuesta(sondeo(clase));
    return respuesta({ id: '20000000-0000-4000-8000-000000000002' });
  });

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const cuerpoDelAlta = async (): Promise<Record<string, unknown>> => {
  const espia = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  let alta: Request | undefined;
  await waitFor(() => {
    alta = (espia.mock.calls as [Request][])
      .map(([r]) => r)
      .find((r) => r.method === 'POST' && new URL(r.url).pathname.endsWith('/equipos'));
    expect(alta).toBeDefined();
  });
  return (await alta!.clone().json()) as Record<string, unknown>;
};

const probarYGuardar = async (): Promise<Record<string, unknown>> => {
  render(
    <Envoltura>
      <AltaDeEquipo copropiedadId={COP} abierto alCerrar={() => undefined} />
    </Envoltura>,
  );
  const dialogo = screen.getByRole('dialog');
  for (const campo of Array.from(dialogo.querySelectorAll<HTMLInputElement>('input'))) {
    const tipo = campo.getAttribute('type');
    if (tipo !== 'text' && tipo !== 'password' && tipo !== null) continue;
    if (campo.value !== '') continue;
    fireEvent.change(campo, { target: { value: 'camara1' } });
  }
  fireEvent.click(screen.getByRole('button', { name: /Probar conexión/ }));
  await screen.findByText(/^resultado /);
  const enviar = dialogo.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  fireEvent.click(enviar);
  return cuerpoDelAlta();
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('H-SITIO-01 · guardar tras probar deja que el servidor fije el estado', () => {
  for (const clase of ['decide_solo', 'alcanzado', 'inalcanzable']) {
    describe(clase, () => {
      beforeEach(() => {
        vi.stubGlobal('fetch', servidor(clase));
      });
      it('el alta pide al servidor que vuelva a sondear', async () => {
        expect((await probarYGuardar())['probarConexion']).toBe(true);
      });
    });
  }

  describe('credencial', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', servidor('credencial'));
    });
    it('tras un rechazo de credencial NO se reintenta: acerca el bloqueo de la cuenta', async () => {
      expect((await probarYGuardar())['probarConexion']).toBe(false);
    });
  });
});

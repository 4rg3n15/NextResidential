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
    if (entrada.url.endsWith('/zonas')) return respuesta([]);
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

describe('C2 (15-L) · el videoportero edita su puerta, su canal de video y su zona', () => {
  const VIDEOPORTERO = {
    id: '20000000-0000-4000-8000-000000000009',
    nombre: 'Videoportero de la entrada',
    tipo: 'intercom',
    modelo: null,
    firmware: null,
    canalBarrera: null,
    numeroDePuerta: 2,
    canalDeAudio: 1,
    fabricante: null,
    modoDeTerminal: null,
    canalDeAudioHabilitado: true,
    canalDeVideo: '101',
    zonaId: null,
    capacidades: null,
    verificacion: 'verificado',
    verificadoEn: null,
    motivoNoVerificado: null,
    estado: 'activo',
    atestacion: null,
    estadoDelEquipo: {
      enLinea: 'en_linea',
      motivo: 'Con señal hace 30 s por su latido',
      alcanzable: true,
      autenticacion: 'aceptada',
      autenticacionRechazadaHaceMin: null,
      escucha: 'no_aplica',
      ultimoEvento: null,
      ultimoLatido: '2026-09-09T12:00:00Z',
      ultimaSenal: '2026-09-09T12:00:00Z',
    },
    sondeadoEn: null,
    identidadLeidaEn: null,
  } as const;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (entrada: Request) =>
        entrada.url.endsWith('/zonas')
          ? respuesta([{ id: 'z-1', nombre: 'Portería' }])
          : respuesta({ ...VIDEOPORTERO }),
      ),
    );
  });

  it('lo guardado llega relleno, y lo cambiado viaja en la edición', async () => {
    const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidadas = vi.spyOn(consultas, 'invalidateQueries');
    render(
      <QueryClientProvider client={consultas}>
        <AltaDeEquipo
          copropiedadId={COP}
          abierto
          alCerrar={() => undefined}
          equipo={VIDEOPORTERO as never}
        />
      </QueryClientProvider>,
    );
    expect((screen.getByLabelText('Número de puerta') as HTMLInputElement).value).toBe('2');
    const canal = screen.getByLabelText(/Canal de video/) as HTMLInputElement;
    expect(canal.value).toBe('101');

    fireEvent.change(canal, { target: { value: '1a2' } });
    expect(await screen.findByText('Escriba el canal como 102, 101, 202…')).toBeTruthy();
    fireEvent.change(canal, { target: { value: '202' } });
    await screen.findByRole('option', { name: 'Portería' });
    fireEvent.change(screen.getByLabelText('Zona del equipo'), { target: { value: 'z-1' } });

    const dialogo = screen.getByRole('dialog');
    fireEvent.click(dialogo.querySelector<HTMLButtonElement>('button[type="submit"]')!);
    const espia = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    let edicion: Request | undefined;
    await waitFor(() => {
      edicion = (espia.mock.calls as [Request][]).map(([r]) => r).find((r) => r.method === 'PUT');
      expect(edicion).toBeDefined();
    });
    expect(await edicion!.clone().json()).toMatchObject({
      numeroDePuerta: 2,
      canalDeAudio: 1,
      canalDeVideo: '202',
      zonaId: 'z-1',
    });
    // C1 · la tabla de Dispositivos (que sale del tablero) se refresca ya.
    await waitFor(() =>
      expect(invalidadas).toHaveBeenCalledWith({ queryKey: ['tablero', COP, 'dispositivos'] }),
    );
  });
});

/**
 * V2 (15-N) · «Probar conexión» propone el canal que el equipo DECLARA y el
 * alta lo guarda. La cámara del 29/09 quedó registrada con el 102, que no tiene.
 */
describe('V2 · el canal de video propuesto es uno de los que el equipo declara', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (entrada: Request) => {
        if (entrada.url.includes('/prueba-de-conexion')) {
          return respuesta({
            ...sondeo('alcanzado'),
            capacidades: {
              origen: 'descubierta',
              video: {
                estado: 'si',
                codec: 'H.264',
                canal: '101',
                canales: [{ id: '101', codec: 'H.264' }],
              },
            },
          });
        }
        if (entrada.url.endsWith('/zonas')) return respuesta([]);
        return respuesta({ id: '20000000-0000-4000-8000-000000000002' });
      }),
    );
  });

  it('tras probar, el alta envía el 101 que la cámara declara', async () => {
    expect((await probarYGuardar())['canalDeVideo']).toBe('101');
  });
});

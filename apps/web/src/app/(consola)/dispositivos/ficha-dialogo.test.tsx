import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Equipo } from '@ncr/contracts';
import { FichaDialogo } from './ficha-dialogo';

/**
 * O4 · la ficha de un equipo en servicio: al abrir, el SERVIDOR sondea con la
 * clave guardada; la ficha que llega es la del TIPO del equipo; y corregir
 * exige un motivo. Lo que sale del navegador nunca lleva una clave.
 */
const COP = '10000000-0000-4000-8000-000000000001';

const TERMINAL: Equipo = {
  id: 'eq-1',
  nombre: 'Terminal del gimnasio',
  tipo: 'terminal_facial',
  host: 'terminal.equipo.invalid',
  puerto: 80,
  protocolo: 'http',
  usuario: 'servicio',
  modelo: null,
  firmware: null,
  canalBarrera: null,
  numeroDePuerta: 1,
  canalDeAudio: null,
  fabricante: null,
  modoDeTerminal: 'reporta_y_espera',
  canalDeAudioHabilitado: false,
  capacidades: null,
  verificacion: 'no_verificado',
  verificadoEn: null,
  motivoNoVerificado: null,
  estado: 'activo',
};

const SONDEO = {
  clase: 'alcanzado',
  detalle: 'El equipo responde y acepta la credencial',
  modelo: 'TERMINAL-SIM',
  firmware: 'V1',
  latenciaMs: 12,
  verificado: true,
  ficha: {
    modelo: 'TERMINAL-SIM',
    firmware: 'V1',
    serie: 'S1',
    horaDelEquipo: null,
    desvioDeRelojSegundos: null,
    sinComprobar: [],
    hallazgos: [
      {
        campo: 'quién decide la apertura',
        estado: 'conforme',
        valorLeido: 'reporta y espera el veredicto',
        valorCorrecto: 'reporta y espera el veredicto',
        detalle: 'La terminal reconoce, REPORTA y espera',
        correccion: null,
      },
      {
        campo: 'país del algoritmo',
        estado: 'aviso',
        valorLeido: '1',
        valorCorrecto: '210',
        detalle: 'sólo para comprobar el botón',
        correccion: 'pais_del_algoritmo',
      },
    ],
  },
};

const respuesta = (cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const peticiones: { metodo: string; ruta: string; cuerpo: string }[] = [];

const servidorFalso = (): ReturnType<typeof vi.fn> =>
  vi.fn(async (entrada: string | Request) => {
    const url = typeof entrada === 'string' ? entrada : entrada.url;
    const metodo = typeof entrada === 'string' ? 'GET' : entrada.method;
    const cuerpo = typeof entrada === 'string' ? '' : await entrada.clone().text();
    peticiones.push({ metodo, ruta: new URL(url).pathname, cuerpo });
    if (url.includes('/diagnostico')) return respuesta(SONDEO);
    if (url.includes('/correcciones')) {
      return respuesta({
        correccion: 'pais_del_algoritmo',
        aplicada: true,
        valorAnterior: '1',
        valorNuevo: '210',
        detalle: 'El equipo aceptó el cambio',
      });
    }
    return respuesta({});
  });

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
  >
    {children}
  </QueryClientProvider>
);

beforeEach(() => {
  peticiones.length = 0;
  vi.stubGlobal('fetch', servidorFalso());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la ficha de un equipo en servicio (O4)', () => {
  it('al abrir sondea por POST …/diagnostico sin enviar ninguna clave, y pinta la ficha del tipo', async () => {
    render(
      <Envoltura>
        <FichaDialogo copropiedadId={COP} equipo={TERMINAL} alCerrar={() => undefined} />
      </Envoltura>,
    );
    await waitFor(() =>
      expect(screen.getByText(/Correcto · quién decide la apertura/)).toBeDefined(),
    );
    const sondeo = peticiones.find((p) => p.ruta.endsWith('/diagnostico'));
    expect(sondeo?.metodo).toBe('POST');
    // Ni el cuerpo de la petición ni la ruta llevan clave alguna.
    expect(sondeo?.cuerpo).toBe('');
    expect(screen.getByText(/12 ms/)).toBeDefined();
  });

  it('corregir exige un motivo: sin él no hay botón; con él, viaja al servidor y se vuelve a sondear', async () => {
    render(
      <Envoltura>
        <FichaDialogo copropiedadId={COP} equipo={TERMINAL} alCerrar={() => undefined} />
      </Envoltura>,
    );
    await waitFor(() => expect(screen.getByText(/Aviso · país del algoritmo/)).toBeDefined());
    expect(screen.queryByText('Corregirlo en el equipo')).toBeNull();

    fireEvent.change(screen.getByLabelText(/Motivo de la corrección/), {
      target: { value: 'Placas colombianas' },
    });
    fireEvent.click(await screen.findByText('Corregirlo en el equipo'));

    await waitFor(() => expect(screen.getByText(/Antes: 1 → ahora: 210/)).toBeDefined());
    const correccion = peticiones.find((p) => p.ruta.endsWith('/correcciones'));
    expect(correccion?.metodo).toBe('POST');
    expect(JSON.parse(correccion?.cuerpo ?? '{}')).toEqual({
      correccion: 'pais_del_algoritmo',
      motivo: 'Placas colombianas',
    });
    // Tras corregir, se vuelve a preguntar al equipo: dos sondeos en total.
    expect(peticiones.filter((p) => p.ruta.endsWith('/diagnostico'))).toHaveLength(2);
  });
});

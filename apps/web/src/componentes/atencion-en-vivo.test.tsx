import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EnAtencion } from '@ncr/contracts';

/**
 * G2 (15-N) · el aviso que llega aunque el operador esté en otra pantalla:
 * suena UNA vez por elemento nuevo (si su disparador suena), enseña «Atender»
 * fuera de Guardia y Portería, y lleva a la pantalla con ESE elemento.
 */
let ruta = '/eventos';
const empujar = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => ruta,
  useRouter: () => ({ push: empujar }),
}));

import { AtencionEnVivo } from './atencion-en-vivo';
import type { abrirCanal } from '@/lib/sse/canal';

const COP = '10000000-0000-4000-8000-000000000001';
const ID = '00000000-0000-4000-8000-0000000000e1';

const elemento = (
  eventoId: string,
  disparador: EnAtencion['disparador'] = 'llamada',
): EnAtencion => ({
  eventoId,
  origen: 'equipo',
  disparador,
  titulo: 'Llamada entrante',
  ocurridoEn: '2026-09-30T12:00:00.000Z',
  motivo: null,
  resultado: null,
  dispositivoId: 'd',
  viviendaId: null,
  placaDetectada: null,
  conEvidencia: false,
  esperaSegundos: 7,
  urgencia: 'normal',
  demorado: false,
});

let cola: EnAtencion[] = [];
let sonidoDeLlamada = true;

beforeEach(() => {
  ruta = '/eventos';
  empujar.mockClear();
  cola = [];
  sonidoDeLlamada = true;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            cola,
            total: cola.length,
            criticos: 0,
            esperaMaxima: 7,
            vigenciaSegundos: 300,
            preferencias: {
              llamada: { abrir: true, sonar: sonidoDeLlamada },
              rostro: { abrir: true, sonar: true },
              placa: { abrir: true, sonar: true },
              lista_negra: { abrir: true, sonar: true },
              dudoso: { abrir: true, sonar: true },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

const sinCanal: typeof abrirCanal = () => () => undefined;

const montar = (
  sonar = vi.fn(() => true),
  notificarNavegador = vi.fn(() => true),
  consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) => {
  render(
    <QueryClientProvider client={consultas}>
      <AtencionEnVivo
        copropiedadId={COP}
        rol="operador_central"
        suscribir={sinCanal}
        sonar={sonar}
        notificarNavegador={notificarNavegador}
      >
        <p>pantalla</p>
      </AtencionEnVivo>
    </QueryClientProvider>,
  );
  return { sonar, notificarNavegador, consultas };
};

describe('G2 · aviso de atención en otra pantalla', () => {
  it('suena, notifica y enseña «Atender», que lleva a Guardia con ESE elemento', async () => {
    cola = [elemento(ID)];
    const { sonar, notificarNavegador } = montar();
    await screen.findByRole('alertdialog');
    expect(sonar).toHaveBeenCalledTimes(1);
    expect(notificarNavegador).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Atender' }));
    expect(empujar).toHaveBeenCalledWith(`/guardia?atender=${ID}`);
  });

  it('lo ya visto no vuelve a sonar aunque la cola se refresque', async () => {
    cola = [elemento(ID)];
    const { sonar, consultas } = montar();
    await screen.findByRole('alertdialog');
    await consultas.invalidateQueries();
    await consultas.invalidateQueries();
    expect(sonar).toHaveBeenCalledTimes(1);
  });

  it('en Guardia no hay aviso (la pantalla ya atiende), pero sí suena', async () => {
    ruta = '/guardia';
    cola = [elemento(ID)];
    const { sonar } = montar();
    await waitFor(() => expect(sonar).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('con el sonido de ese disparador apagado en la copropiedad, no suena', async () => {
    sonidoDeLlamada = false;
    cola = [elemento(ID)];
    const { sonar } = montar();
    await screen.findByRole('alertdialog');
    expect(sonar).not.toHaveBeenCalled();
  });

  it('si el navegador no deja sonar, lo dice', async () => {
    cola = [elemento(ID)];
    montar(vi.fn(() => false));
    await screen.findByText(/no dejó sonar el aviso/);
  });

  it('cola vacía: ni sonido ni aviso', async () => {
    const { sonar } = montar();
    await new Promise((r) => setTimeout(r, 50));
    expect(sonar).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

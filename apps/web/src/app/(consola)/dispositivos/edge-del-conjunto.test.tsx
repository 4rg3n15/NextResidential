import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EdgeDelConjunto, estadoDelEdge } from './edge-del-conjunto';

const COP = '10000000-0000-4000-8000-000000000001';
const EDGE = 'a0000000-0000-4000-8000-000000000001';
const ficha = (extra: Record<string, unknown> = {}) => ({
  id: EDGE,
  nombre: 'Edge Mira 01',
  puente: true,
  puenteDesde: '2026-10-01T10:00:00.000Z',
  conectado: true,
  conexionDesde: '2026-10-02T08:00:00.000Z',
  ultimoLatido: null,
  versionDeReglas: 4,
  ...extra,
});
const json = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  });

let peticiones: Request[] = [];
const servir = (responder: (p: Request) => Response) => {
  peticiones = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (p: Request) => {
      peticiones.push(p);
      return responder(p);
    }),
  );
};
afterEach(() => vi.unstubAllGlobals());

const montar = (hijo: ReactNode) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {hijo}
    </QueryClientProvider>,
  );

describe('A3 · el Edge del conjunto en Dispositivos (15-Q2)', () => {
  it('conectado / desconectado DESDE cuándo, o que nunca se conectó', () => {
    expect(estadoDelEdge(ficha() as never)).toMatchObject({ tono: 'exito' });
    expect(estadoDelEdge(ficha() as never).texto).toMatch(/^Conectado desde /);
    const caido = estadoDelEdge(ficha({ conectado: false }) as never);
    expect(caido.tono).toBe('peligro');
    expect(caido.texto).toMatch(/^Desconectado desde /);
    expect(estadoDelEdge(ficha({ conectado: false, conexionDesde: null }) as never)).toEqual({
      tono: 'neutro',
      texto: 'Nunca se ha conectado',
    });
  });

  it('sin Edge (o sin permiso para verlo), la pantalla queda como antes (R1)', async () => {
    servir(() => json([]));
    const { container } = montar(<EdgeDelConjunto copropiedadId={COP} esSuperadmin={false} />);
    await waitFor(() => expect(peticiones).toHaveLength(1));
    expect(container.innerHTML).toBe('');
    servir(() => json({ mensaje: 'prohibido' }, 403));
    const otro = montar(<EdgeDelConjunto copropiedadId={COP} esSuperadmin={false} />);
    await waitFor(() => expect(peticiones).toHaveLength(1));
    expect(otro.container.innerHTML).toBe('');
  });

  it('un puente desconectado avisa que las órdenes no llegan; el administrador no ve acciones', async () => {
    servir(() => json([ficha({ conectado: false })]));
    montar(<EdgeDelConjunto copropiedadId={COP} esSuperadmin={false} />);
    expect(await screen.findByText('Puente de los equipos')).toBeTruthy();
    expect(screen.getByText(/las órdenes a los equipos fallan/i)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('el superadministrador muda las credenciales y ve cuáles siguen en la nube y por qué', async () => {
    servir((p) =>
      p.url.endsWith('/migrar-credenciales')
        ? json([
            { dispositivoId: 'x', trasladada: true, motivo: 'ok' },
            { dispositivoId: 'y', trasladada: false, motivo: 'el equipo rechazó la credencial' },
          ])
        : json([ficha()]),
    );
    montar(<EdgeDelConjunto copropiedadId={COP} esSuperadmin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mudar credenciales al Edge' }));
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      '1 mudada(s); 1 siguen en la nube: el equipo rechazó la credencial',
    );
    const migracion = peticiones.find((p) => p.url.endsWith('/migrar-credenciales'));
    expect(migracion?.method).toBe('POST');
    expect(migracion?.url).toContain(`/copropiedades/${COP}/edge-gateways/${EDGE}/`);
  });

  it('quitar el puente manda `puente: false`', async () => {
    servir((p) => (p.method === 'POST' ? json({ ok: true }) : json([ficha()])));
    montar(<EdgeDelConjunto copropiedadId={COP} esSuperadmin />);
    fireEvent.click(await screen.findByRole('button', { name: 'Quitar puente' }));
    await waitFor(() => expect(peticiones.some((p) => p.method === 'POST')).toBe(true));
    const marca = peticiones.find((p) => p.method === 'POST');
    expect(marca?.url).toMatch(/\/edge-gateways\/[^/]+\/puente$/);
    expect(await marca?.clone().json()).toEqual({ puente: false });
  });
});

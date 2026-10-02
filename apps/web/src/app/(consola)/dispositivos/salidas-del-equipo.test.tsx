import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NodoDeSalidas, PuntoDeAcceso, SalidasDelEquipo } from '@ncr/contracts';
import { SalidasDelVideoportero } from './salidas-del-equipo';

/**
 * 15-P · P3/P5 · la sección «Salidas» de la ficha del videoportero: lo que el
 * equipo declara agrupado por módulo, descubrir, renombrar, y los estados.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const VP = '70000000-0000-4000-8000-000000000001';

const nodo = (
  ruta: string,
  nivel: number,
  tipo: NodoDeSalidas['tipo'],
  nombre: string,
  extra: Partial<NodoDeSalidas> = {},
): NodoDeSalidas => ({
  ruta,
  padre: nivel === 1 ? null : ruta.split('/').slice(0, -1).join('/'),
  nivel,
  tipo,
  nombre,
  numeroDePuerta: null,
  estado: null,
  nota: null,
  ...extra,
});

const ARBOL: NodoDeSalidas[] = [
  nodo('equipo', 1, 'equipo', 'DS-KD'),
  nodo('equipo/propio', 2, 'modulo', 'Salidas del equipo'),
  nodo('equipo/propio/puerta-1', 3, 'salida', 'Cerradura 1', { numeroDePuerta: 1 }),
  nodo('equipo/propio/puerta-2', 3, 'salida', 'Cerradura 2', { numeroDePuerta: 2 }),
  nodo('equipo/unidad-segura-1', 2, 'modulo', 'Unidad de puerta segura 1', {
    estado: 'manipulada',
    nota: 'Protege una cerradura del equipo',
  }),
];
const punto = (n: number, nombre: string): PuntoDeAcceso => ({
  id: `p-${String(n)}`,
  dispositivoId: VP,
  nombre,
  numeroDePuerta: n,
  modulo: 'Salidas del equipo',
  rutaEnElEquipo: `equipo/propio/puerta-${String(n)}`,
  origen: 'descubierto',
  descubiertoEn: '2026-10-01T12:00:00.000Z',
});

let vista: SalidasDelEquipo;
let estadoDeLaLectura = 200;
const peticiones: { metodo: string; ruta: string; cuerpo: unknown }[] = [];
const json = (c: unknown, status = 200): Response =>
  new Response(JSON.stringify(c), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  peticiones.length = 0;
  estadoDeLaLectura = 200;
  vista = { arbol: ARBOL, motivoSinArbol: null, puntos: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (p: Request) => {
      const ruta = new URL(p.url).pathname;
      const cuerpo = p.method === 'GET' ? null : await p.json().catch(() => null);
      peticiones.push({ metodo: p.method, ruta, cuerpo });
      if (ruta.endsWith('/salidas/descubrir')) {
        vista = { ...vista, puntos: [punto(1, 'Cerradura 1'), punto(2, 'Cerradura 2')] };
        return json(vista);
      }
      if (p.method === 'PATCH') {
        const nombre = (cuerpo as { nombre: string }).nombre;
        vista = { ...vista, puntos: [punto(1, 'Cerradura 1'), punto(2, nombre)] };
        return json(punto(2, nombre));
      }
      return estadoDeLaLectura === 200
        ? json(vista)
        : json({ estado: estadoDeLaLectura, correlacion: 'c', mensaje: 'no' }, estadoDeLaLectura);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const montar = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SalidasDelVideoportero copropiedadId={COP} equipoId={VP} />
    </QueryClientProvider>,
  );

describe('Salidas del videoportero', () => {
  it('lo declarado, por módulo y con su estado; sin puntos aún, lo dice', async () => {
    montar();
    const propias = await screen.findByRole('list', { name: 'Salidas de Salidas del equipo' });
    expect(propias.textContent).toMatch(/Cerradura 1.*Cerradura 2/);
    expect(screen.getByText('Manipulada')).toBeTruthy();
    expect(screen.getByText(/Aún no hay puntos/)).toBeTruthy();
  });

  it('descubrir persiste; renombrar manda SÓLO el nombre nuevo de ESE punto', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Descubrir salidas' }));
    const campo = await screen.findByRole('textbox', { name: 'Nombre de la puerta 2' });
    fireEvent.change(campo, { target: { value: 'Portón vehicular' } });
    const guardar = screen.getAllByRole('button', { name: 'Guardar nombre' });
    expect(guardar[0]?.hasAttribute('disabled')).toBe(true);
    fireEvent.click(guardar[1]!);
    await waitFor(() => expect(peticiones.some((x) => x.metodo === 'PATCH')).toBe(true));
    const patch = peticiones.find((x) => x.metodo === 'PATCH');
    expect(patch?.ruta.endsWith(`/copropiedades/${COP}/equipos/${VP}/salidas/p-2`)).toBe(true);
    expect(patch?.cuerpo).toEqual({ nombre: 'Portón vehicular' });
  });

  it('el equipo no contestó: el motivo, y lo persistido sigue a la vista', async () => {
    vista = {
      arbol: [],
      motivoSinArbol: 'El equipo no respondió',
      puntos: [punto(1, 'Cerradura 1')],
    };
    montar();
    expect(
      await screen.findByText(/No se pudo leer el equipo: El equipo no respondió/),
    ).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Nombre de la puerta 1' })).toBeTruthy();
  });

  it('sin permiso: lo dice en palabras', async () => {
    estadoDeLaLectura = 403;
    montar();
    expect((await screen.findByRole('alert')).textContent).toMatch(/no administra las salidas/);
  });
});

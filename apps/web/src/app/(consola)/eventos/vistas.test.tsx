import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ElementoDeLineaDeTiempo, Rol } from '@ncr/contracts';
import { PantallaDeEventos } from './pantalla';

/**
 * D-145 · decisión del cliente (23/10): se conservan TODOS los eventos. Al
 * portero se le limpia la VISTA —su día en Bogotá y, si pulsa «Limpiar», desde
 * ese instante—; la administración, la superadministración y la central no
 * tienen corte ni botón. Las alertas abiertas no se tocan.
 *
 * El reloj se fija a las 22:30 del 25/10 en Bogotá (03:30 del 26/10 en UTC):
 * un corte hecho en UTC pediría el día equivocado.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-26T03:30:00.000Z');
const INICIO_25 = '2026-10-25T05:00:00.000Z';
const PERSONA = '30000000-0000-4000-8000-000000000001';
const OPERADOR = '00000000-0000-4000-8000-000000000010';
const AVISO = /Sólo limpia esta vista\. El historial completo lo conserva la administración/;

const elemento = (extra: Partial<ElementoDeLineaDeTiempo>): ElementoDeLineaDeTiempo => ({
  origen: 'acceso',
  id: 'e-1',
  ocurridoEn: '2026-10-26T02:00:00.000Z',
  horaDelEquipo: null,
  relojDesviadoSegundos: null,
  dispositivoId: 'dis-1',
  tipo: 'acceso',
  titulo: 'Acceso permitido · placa ABC123',
  resultado: 'permitido',
  enVivo: true,
  eventoId: 'e-1',
  codigo: null,
  metodo: 'placa',
  motivo: null,
  placa: 'ABC123',
  personaId: null,
  persona: null,
  clasePersona: null,
  viviendaId: null,
  vivienda: null,
  operadorId: null,
  operador: null,
  ...extra,
});

const FILAS: ElementoDeLineaDeTiempo[] = [
  elemento({}),
  elemento({
    id: 'e-2',
    metodo: 'facial',
    placa: null,
    personaId: PERSONA,
    persona: 'Laura Gómez',
    clasePersona: 'residente',
    vivienda: 'Casa 12',
  }),
  elemento({
    id: 'e-3',
    metodo: 'manual',
    resultado: 'negado',
    motivo: 'LISTA_NEGRA',
    placa: null,
    operadorId: OPERADOR,
    operador: 'Pedro Portero',
  }),
];

let lineas: URL[] = [];
let alertas = 0;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  lineas = [];
  alertas = 0;
  window.localStorage.clear();
  window.history.replaceState(null, '', '/eventos');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (p: Request) => {
      const url = new URL(p.url);
      let cuerpo: unknown = [];
      if (url.pathname.endsWith('/linea-de-tiempo')) {
        lineas.push(url);
        cuerpo = { elementos: FILAS };
      } else if (url.pathname.includes('/alertas')) {
        alertas += 1;
      } else if (url.pathname.endsWith('/padron/viviendas')) {
        cuerpo = { totales: { activas: 0, inactivas: 0 }, viviendas: [] };
      }
      return new Response(JSON.stringify(cuerpo), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const montar = (rol: Rol, parametros = ''): void => {
  const clientes = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const envolver = (hijo: ReactNode) => (
    <QueryClientProvider client={clientes}>{hijo}</QueryClientProvider>
  );
  render(envolver(<PantallaDeEventos copropiedadId={COP} rol={rol} parametros={parametros} />));
};

/** Montada y con datos: la barra de filtros sólo se pinta con la tabla cargada. */
const montada = async (rol: Rol, parametros = ''): Promise<void> => {
  montar(rol, parametros);
  await screen.findByRole('table');
};

const ultimaLinea = (): URL => {
  const u = lineas.at(-1);
  if (u === undefined) throw new Error('no se pidió la línea de tiempo');
  return u;
};

describe('D-145 · el portero ve su día de Bogotá y puede limpiar la vista', () => {
  it('pide desde las 00:00 de HOY en Bogotá, no en UTC, y lo dice', async () => {
    await montada('portero');
    expect(ultimaLinea().searchParams.get('desde')).toBe(INICIO_25);
    expect(screen.getByText(AVISO)).toBeDefined();
    expect(screen.getByText(/Hoy, desde las 00:00/)).toBeDefined();
    // Sin fechas que elegir: su vista es su día. El resto de filtros, sí.
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getByLabelText('Placa')).toBeDefined();
  });

  it('«Limpiar» corta desde ese instante, lo recuerda, y no toca las alertas', async () => {
    montar('portero');
    await waitFor(() => expect(lineas.length).toBeGreaterThan(0));
    const alertasAntes = alertas;
    vi.setSystemTime(new Date('2026-10-26T03:45:00.000Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    await waitFor(() =>
      expect(ultimaLinea().searchParams.get('desde')).toBe('2026-10-26T03:45:00.000Z'),
    );
    expect(window.localStorage.getItem(`ncr.eventos.limpiadoEn.${COP}`)).toBe(
      '2026-10-26T03:45:00.000Z',
    );
    expect(screen.getByText(/Hoy, desde las 22:45/)).toBeDefined();
    expect(alertas).toBe(alertasAntes);
  });

  it('sin almacenamiento del navegador la pantalla funciona y «Limpiar» sigue limpiando', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    montar('portero');
    await waitFor(() => expect(lineas.length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    await waitFor(() => expect(ultimaLinea().searchParams.get('desde')).toBe(AHORA.toISOString()));
  });
});

describe('D-145 · administración, superadministración y central no limpian', () => {
  it.each(['administrador', 'superadministrador', 'operador_central'] as const)(
    '%s: sin botón, sin aviso y sin corte (7 días por omisión)',
    async (rol) => {
      await montada(rol);
      expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull();
      expect(document.querySelectorAll('input[type="datetime-local"]')).toHaveLength(2);
      expect(screen.queryByText(AVISO)).toBeNull();
      expect(ultimaLinea().searchParams.get('desde')).toBe('2026-10-18T05:00:00.000Z');
    },
  );

  it('ni un «Limpiar» guardado en el navegador le recorta nada a la administración', async () => {
    window.localStorage.setItem(`ncr.eventos.limpiadoEn.${COP}`, '2026-10-26T03:00:00.000Z');
    montar('administrador');
    await waitFor(() => expect(lineas.length).toBeGreaterThan(0));
    expect(ultimaLinea().searchParams.get('desde')).toBe('2026-10-18T05:00:00.000Z');
  });
});

describe('D-145 · el buscador: filtros en la URL y en la consulta', () => {
  it('los filtros del enlace llegan a la API, con la placa normalizada', async () => {
    montar(
      'administrador',
      `placa=abc-123&metodo=facial&identificacion=desconocida&operadorId=${OPERADOR}`,
    );
    await waitFor(() => expect(lineas.length).toBeGreaterThan(0));
    const q = ultimaLinea().searchParams;
    expect([q.get('placa'), q.get('metodo'), q.get('identificacion'), q.get('operadorId')]).toEqual(
      ['ABC123', 'facial', 'desconocida', OPERADOR],
    );
  });

  it('desde/hasta con hora, en Bogotá; y «Borrar filtros» lo deja todo como al abrir', async () => {
    await montada('administrador');
    const [desde] = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'),
    );
    fireEvent.change(desde as HTMLInputElement, { target: { value: '2026-10-20T08:15' } });
    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'negado' } });
    await waitFor(() =>
      expect(ultimaLinea().searchParams.get('desde')).toBe('2026-10-20T13:15:00.000Z'),
    );
    expect(ultimaLinea().searchParams.get('resultado')).toBe('negado');
    expect(window.location.search).toContain('desde=2026-10-20T08%3A15');
    expect(window.location.search).toContain('resultado=negado');

    fireEvent.click(screen.getByRole('button', { name: 'Borrar filtros' }));
    await waitFor(() => expect(window.location.search).toBe(''));
    expect(ultimaLinea().searchParams.get('resultado')).toBeNull();
  });

  it('una placa a medio escribir no se pide: se avisa', async () => {
    await montada('administrador');
    fireEvent.change(screen.getByLabelText('Placa'), { target: { value: 'ab' } });
    expect(await screen.findByText(/Escriba la placa completa/)).toBeDefined();
    expect(lineas.every((u) => !u.searchParams.has('placa'))).toBe(true);
  });
});

describe('D-145 · cada fila dice quién, cómo y con qué', () => {
  it('persona con su clase o «Desconocido», operador si fue a mano, método y placa', async () => {
    montar('administrador');
    const tabla = await screen.findByRole('table');
    await waitFor(() => expect(within(tabla).getByText('Laura Gómez · residente')).toBeDefined());
    expect(within(tabla).getAllByText('Desconocido')).toHaveLength(2);
    expect(within(tabla).getByText('Pedro Portero')).toBeDefined();
    expect(within(tabla).getByText('Rostro')).toBeDefined();
    expect(within(tabla).getByText('ABC123')).toBeDefined();
    expect(within(tabla).getByText(/Negado · Persona o placa en lista negra/)).toBeDefined();
    expect(within(tabla).getAllByText('25-10-2026 21:00:00').length).toBeGreaterThan(0);
    // Y el operador visto queda para filtrar por él.
    expect(
      within(screen.getByLabelText('Operador')).getByRole('option', { name: 'Pedro Portero' }),
    ).toBeDefined();
  });
});

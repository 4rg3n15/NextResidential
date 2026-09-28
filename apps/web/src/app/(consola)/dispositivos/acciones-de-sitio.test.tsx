import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Equipo } from '@ncr/contracts';
import { AccionesDeSitio, textoDelResultado } from './acciones-de-sitio';
import { FranjaDeEquiposSimulados } from '@/componentes/franja-equipos-simulados';

/**
 * Corrección de la 15-L · las acciones del día de entrega en la ficha: la
 * cámara ofrece «Enviar eventos a este Mac»; la terminal, el interruptor de la
 * verificación remota. Sin motivo no se ofrece nada; lo que llega de la API se
 * enseña en palabras. Y la franja de equipos simulados enseña su texto.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const equipo = (tipo: Equipo['tipo']): Equipo =>
  ({ id: 'eq-1', nombre: 'Equipo', tipo, estado: 'activo' }) as unknown as Equipo;

const RESULTADO = {
  aplicada: true,
  valorAnterior: '192.0.2.9:8080',
  valorNuevo: '192.0.2.23:3000',
  detalle: 'La cámara publicará sus eventos en 192.0.2.23:3000 (confirmado al leerlo de vuelta)',
};

let pedidas: Request[] = [];
const conApi = (cuerpo: unknown, estado = 200): void => {
  pedidas = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: Request) => {
      pedidas.push(entrada);
      return new Response(JSON.stringify(cuerpo), {
        status: estado,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
};
afterEach(() => vi.unstubAllGlobals());

describe('las acciones del día de entrega, en la ficha', () => {
  it('la cámara: «Enviar eventos a este Mac», con el motivo, y el resultado en palabras', async () => {
    conApi(RESULTADO);
    const alTerminar = vi.fn();
    render(
      <AccionesDeSitio
        copropiedadId={COP}
        equipo={equipo('camara_lpr')}
        motivo="cambio de red en sitio"
        alTerminar={alTerminar}
        alFallar={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enviar eventos a este Mac' }));
    await waitFor(() => expect(alTerminar).toHaveBeenCalled());
    const r = pedidas[0]!;
    expect(r.method).toBe('POST');
    expect(new URL(r.url).pathname).toMatch(/\/equipos\/eq-1\/enviar-eventos-a-este-mac$/);
    expect(await r.clone().json()).toEqual({ motivo: 'cambio de red en sitio' });
    expect(alTerminar).toHaveBeenCalledWith(textoDelResultado(RESULTADO));
    expect(screen.queryByText(/Verificación remota: desactivar/)).toBeNull();
  });

  it('la terminal: desactivar manda activar=false por PUT', async () => {
    conApi({ ...RESULTADO, valorAnterior: 'true', valorNuevo: 'false' });
    const alTerminar = vi.fn();
    render(
      <AccionesDeSitio
        copropiedadId={COP}
        equipo={equipo('terminal_facial')}
        motivo="plan B en sitio"
        alTerminar={alTerminar}
        alFallar={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verificación remota: desactivar' }));
    await waitFor(() => expect(alTerminar).toHaveBeenCalled());
    expect(pedidas[0]!.method).toBe('PUT');
    expect(await pedidas[0]!.clone().json()).toEqual({ activar: false, motivo: 'plan B en sitio' });
  });

  it('sin motivo los botones no se pueden pulsar, y el fallo de la API llega en palabras', async () => {
    conApi({ message: 'El Mac no tiene ninguna IP en la red del equipo' }, 409);
    const alFallar = vi.fn();
    const { rerender } = render(
      <AccionesDeSitio
        copropiedadId={COP}
        equipo={equipo('camara_lpr')}
        motivo={null}
        alTerminar={() => undefined}
        alFallar={alFallar}
      />,
    );
    const boton = screen.getByRole('button', { name: 'Enviar eventos a este Mac' });
    expect((boton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Escriba antes el motivo/)).toBeTruthy();
    rerender(
      <AccionesDeSitio
        copropiedadId={COP}
        equipo={equipo('camara_lpr')}
        motivo="otra vez"
        alTerminar={() => undefined}
        alFallar={alFallar}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enviar eventos a este Mac' }));
    await waitFor(() => expect(alFallar).toHaveBeenCalled());
  });

  it('el videoportero no tiene estas acciones', () => {
    const { container } = render(
      <AccionesDeSitio
        copropiedadId={COP}
        equipo={equipo('intercom')}
        motivo="x x x x x"
        alTerminar={() => undefined}
        alFallar={() => undefined}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('un cambio no aplicado se dice tal cual, sin «antes/ahora»', () => {
    expect(
      textoDelResultado({ ...RESULTADO, aplicada: false, detalle: 'no apunta a este Mac' }),
    ).toBe('no apunta a este Mac');
  });

  it('la franja de equipos simulados enseña el texto de la API', () => {
    render(
      <FranjaDeEquiposSimulados texto="Equipos simulados: las órdenes no llegan a ningún equipo real" />,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Equipos simulados: las órdenes no llegan a ningún equipo real',
    );
  });
});

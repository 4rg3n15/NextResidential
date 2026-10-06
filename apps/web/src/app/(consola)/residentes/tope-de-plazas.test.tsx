import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TopeDePlazasDeVivienda } from './tope-de-plazas';

/**
 * RONDA 15-W · «PLAZAS: N DE M» Y «CAMBIAR TOPE» EN LA FICHA DE PLAZAS.
 *
 * Lo que se protege es el CUERPO que viaja —`{ tope, motivo }`, y `tope: null`
 * para volver al de la copropiedad—, que el motivo sea condición del envío y
 * que el 409 de la base («no puede quedar por debajo de las plazas activas»)
 * se lea tal cual: la consola no decide ese límite, lo explica.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const VIVIENDA = '30000000-0000-4000-8000-000000000042';
const RUTA = `/api/ncr/copropiedades/${COP}/viviendas/${VIVIENDA}/tope-de-plazas`;

let actual: { tope: number; activas: number; propio: boolean };
let respuestaDelPut: (cuerpo: { tope: number | null }) => { estado: number; cuerpo: unknown };
let enviados: unknown[];

beforeEach(() => {
  actual = { tope: 4, activas: 3, propio: true };
  enviados = [];
  respuestaDelPut = ({ tope }) => ({
    estado: 200,
    cuerpo: { tope: tope ?? 4, activas: 3, propio: tope !== null },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (p: Request) => {
      if (new URL(p.url).pathname !== RUTA) return new Response('{}', { status: 404 });
      if (p.method === 'PUT') {
        const cuerpo = (await p.json()) as { tope: number | null };
        enviados.push(cuerpo);
        const r = respuestaDelPut(cuerpo);
        return new Response(JSON.stringify(r.cuerpo), {
          status: r.estado,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(actual), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const montar = (): void => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <TopeDePlazasDeVivienda copropiedadId={COP} viviendaId={VIVIENDA} />
    </QueryClientProvider>,
  );
};

const abrir = async (): Promise<HTMLElement> => {
  fireEvent.click(await screen.findByRole('button', { name: 'Cambiar tope' }));
  return screen.findByRole('dialog', { name: /Cambiar el tope de plazas/ });
};

const escribirMotivo = (dialogo: HTMLElement, texto: string): void => {
  fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: texto } });
};

describe('15-W · el tope de plazas de una vivienda', () => {
  it('dice «Plazas: 3 de 4» y si el tope es propio o el de la copropiedad', async () => {
    montar();
    expect(await screen.findByText('Plazas: 3 de 4')).toBeTruthy();
    expect(screen.getByText('Tope propio')).toBeTruthy();
  });

  it('sin motivo no se envía; con él viaja { tope, motivo } y se pinta lo que devuelve la API', async () => {
    montar();
    const dialogo = await abrir();
    const guardar = within(dialogo).getByRole('button', { name: 'Guardar tope' });
    fireEvent.change(within(dialogo).getByLabelText(/Plazas de la vivienda/), {
      target: { value: '5' },
    });
    expect((guardar as HTMLButtonElement).disabled).toBe(true);
    escribirMotivo(dialogo, 'Llegó un familiar');
    expect((guardar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(guardar);
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]).toEqual({ tope: 5, motivo: 'Llegó un familiar' });
    expect(await screen.findByText('Plazas: 3 de 5')).toBeTruthy();
  });

  it('«Volver al tope de la copropiedad» envía tope: null', async () => {
    montar();
    const dialogo = await abrir();
    fireEvent.click(within(dialogo).getByLabelText('Volver al tope de la copropiedad'));
    expect(within(dialogo).queryByLabelText(/Plazas de la vivienda/)).toBeNull();
    escribirMotivo(dialogo, 'Ya no necesita más plazas');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar tope' }));
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0]).toEqual({ tope: null, motivo: 'Ya no necesita más plazas' });
    expect(await screen.findByText('Tope de la copropiedad')).toBeTruthy();
  });

  it('con el tope de la copropiedad no ofrece «volver» a él: sólo un número propio', async () => {
    actual = { tope: 4, activas: 1, propio: false };
    montar();
    expect(await screen.findByText('Tope de la copropiedad')).toBeTruthy();
    const dialogo = await abrir();
    expect(within(dialogo).queryByLabelText('Volver al tope de la copropiedad')).toBeNull();
    expect(within(dialogo).getByLabelText(/Plazas de la vivienda/)).toBeTruthy();
  });

  it('un número fuera de 1 a 20 no se envía', async () => {
    montar();
    const dialogo = await abrir();
    escribirMotivo(dialogo, 'Prueba de límites');
    const guardar = within(dialogo).getByRole('button', { name: 'Guardar tope' });
    for (const malo of ['0', '21', 'dos', '']) {
      fireEvent.change(within(dialogo).getByLabelText(/Plazas de la vivienda/), {
        target: { value: malo },
      });
      expect((guardar as HTMLButtonElement).disabled, malo).toBe(true);
    }
    expect(enviados).toHaveLength(0);
  });

  it('el 409 de la base se enseña tal cual en el diálogo', async () => {
    const mensaje = 'El tope no puede quedar por debajo de las plazas activas';
    respuestaDelPut = () => ({
      estado: 409,
      cuerpo: { estado: 409, correlacion: 'x', mensaje: { message: mensaje, statusCode: 409 } },
    });
    montar();
    const dialogo = await abrir();
    fireEvent.change(within(dialogo).getByLabelText(/Plazas de la vivienda/), {
      target: { value: '2' },
    });
    escribirMotivo(dialogo, 'Se fue un inquilino');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar tope' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toBe(mensaje);
    expect(screen.getByText('Plazas: 3 de 4')).toBeTruthy();
  });
});

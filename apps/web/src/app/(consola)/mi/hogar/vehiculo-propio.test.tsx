import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PantallaDeMisVehiculos } from '../vehiculos/pantalla';
import { COP, Envoltura, VEHICULO_ID, escrituras, respuesta, servidorFalso } from '../pruebas';

const montar = (): ReturnType<typeof render> =>
  render(
    <Envoltura>
      <PantallaDeMisVehiculos copropiedadId={COP} />
    </Envoltura>,
  );

let espia: ReturnType<typeof vi.fn>;
let respuestaDeEscritura: unknown = {};
beforeEach(() => {
  respuestaDeEscritura = {};
  espia = servidorFalso(() => respuestaDeEscritura);
  vi.stubGlobal('fetch', espia);
});
afterEach(() => vi.unstubAllGlobals());

const abrirEdicion = async (): Promise<HTMLElement> => {
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  return screen.findByRole('dialog', { name: 'Editar vehículo' });
};

describe('mis vehículos propios: editar y eliminar (15-Y2)', () => {
  it('sólo el propio y activo tiene «Editar» y «Eliminar»; el de la administración, ninguno', async () => {
    montar();
    expect(await screen.findByText('ADM456')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Eliminar' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Dar de baja' })).toBeNull();
  });

  it('«Editar» precarga placa, color, modelo y marca; la placa igual no viaja como cambio', async () => {
    respuestaDeEscritura = { editado: true };
    montar();
    const dialogo = await abrirEdicion();
    expect((within(dialogo).getByLabelText('Placa') as HTMLInputElement).value).toBe('RES123');
    expect((within(dialogo).getByLabelText('Color') as HTMLInputElement).value).toBe('Gris');
    fireEvent.change(within(dialogo).getByLabelText('Placa'), { target: { value: 'res-123' } });
    fireEvent.change(within(dialogo).getByLabelText('Color'), { target: { value: 'Rojo' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Vehículo RES123 actualizado.'),
    );
    const [e] = await escrituras(espia);
    expect(e).toEqual({
      metodo: 'PUT',
      ruta: `/copropiedades/${COP}/mi/vehiculos/${VEHICULO_ID}`,
      cuerpo: { color: 'Rojo', modelo: '3', marca: 'Mazda', placa: null },
    });
  });

  it('una placa nueva viaja normalizada, y si tiene historial se lee el rechazo de la API', async () => {
    vi.stubGlobal(
      'fetch',
      servidorFalso(() =>
        respuesta(
          {
            estado: 409,
            mensaje: {
              message: 'La placa ya tiene historial en el conjunto: no se cambia.',
              codigo: 'PLACA_CON_HISTORIAL',
            },
          },
          409,
        ),
      ),
    );
    const servidor = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    servidor.mockImplementation(async (entrada: string | Request) => {
      const p = typeof entrada === 'string' ? new Request(entrada) : entrada;
      if (p.method === 'GET') return (await servidorFalso()(entrada)) as Response;
      return respuesta(
        {
          estado: 409,
          mensaje: {
            message: 'La placa ya tiene historial en el conjunto: no se cambia.',
            codigo: 'PLACA_CON_HISTORIAL',
          },
        },
        409,
      );
    });
    montar();
    const dialogo = await abrirEdicion();
    fireEvent.change(within(dialogo).getByLabelText('Placa'), { target: { value: 'xyz 789' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(within(dialogo).getByRole('alert').textContent).toBe(
        'La placa ya tiene historial en el conjunto: no se cambia.',
      ),
    );
    const [e] = await escrituras(servidor);
    expect(e?.cuerpo).toEqual({ color: 'Gris', modelo: '3', marca: 'Mazda', placa: 'XYZ789' });
  });

  it('«Eliminar» confirma sin motivo, borra por DELETE y dice si se borró o quedó dado de baja', async () => {
    respuestaDeEscritura = { resultado: 'dado_de_baja' };
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Eliminar RES123?' });
    expect(dialogo.textContent).toMatch(/Dejará de abrir la talanquera/);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'El vehículo RES123 ya tenía historial en el conjunto: quedó dado de baja y su historial se conserva.',
      ),
    );
    const [e] = await escrituras(espia);
    expect(e).toEqual({
      metodo: 'DELETE',
      ruta: `/copropiedades/${COP}/mi/vehiculos/${VEHICULO_ID}`,
      cuerpo: null,
    });
  });
});

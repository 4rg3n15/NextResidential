import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MenoresDelHogar } from './menores-del-hogar';
import {
  COP,
  Envoltura,
  MENOR_ID,
  PLAZA_2,
  conCodigo,
  escrituras,
  respuesta,
  servidorFalso,
} from '../pruebas';

const montar = (esTitular = true): ReturnType<typeof render> =>
  render(
    <Envoltura>
      <MenoresDelHogar
        copropiedadId={COP}
        esTitular={esTitular}
        ahora={new Date('2026-10-14T12:00:00Z')}
      />
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

const abrirFormulario = async (): Promise<HTMLElement> => {
  fireEvent.click(await screen.findByRole('button', { name: 'Añadir menor' }));
  return screen.findByRole('dialog', { name: 'Añadir menor' });
};

const llenar = (dialogo: HTMLElement, fecha: string): void => {
  fireEvent.change(within(dialogo).getByLabelText('Nombres'), { target: { value: 'Mateo' } });
  fireEvent.change(within(dialogo).getByLabelText('Apellidos'), { target: { value: 'Pérez' } });
  fireEvent.change(within(dialogo).getByLabelText('Fecha de nacimiento'), {
    target: { value: fecha },
  });
  fireEvent.change(within(dialogo).getByLabelText(/Parentesco/), { target: { value: 'Hijo' } });
  fireEvent.change(within(dialogo).getByLabelText('Número de documento'), {
    target: { value: '1098' },
  });
};

describe('los menores del hogar en «Mi familia» (15-Y2)', () => {
  it('los cinco estados: cargando, error, sin permiso, sin conexión y vacío', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    const { unmount } = montar();
    expect(screen.getByRole('status').textContent).toMatch(/Cargando los menores/);
    unmount();

    vi.stubGlobal('fetch', conCodigo(503));
    const e = montar();
    await waitFor(() => expect(screen.getByText('Servicio no disponible por ahora')).toBeTruthy());
    e.unmount();

    vi.stubGlobal('fetch', conCodigo(403));
    const s = montar();
    await waitFor(() => expect(screen.getByText('Sin permiso')).toBeTruthy());
    s.unmount();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const c = montar();
    await waitFor(() => expect(screen.getByText('Sin conexión con el servidor')).toBeTruthy());
    c.unmount();

    vi.stubGlobal(
      'fetch',
      servidorFalso(() => ({}), true),
    );
    montar();
    await waitFor(() => expect(screen.getByText('Sin menores registrados')).toBeTruthy());
  });

  it('lista al menor con su detalle, sin cuenta, y con «Editar» y «Dar de baja»', async () => {
    montar();
    const fila = await screen.findByRole('listitem', { name: 'Sofía Pérez' });
    expect(fila.textContent).toMatch(/Hija · 11 años · Tarjeta de identidad ••••5678 · plaza 3/);
    expect(within(fila).getByText('Sin cuenta')).toBeTruthy();
    expect(within(fila).getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(within(fila).getByRole('button', { name: 'Dar de baja' })).toBeTruthy();
    expect(within(fila).queryByRole('button', { name: 'Código para su cuenta' })).toBeNull();
  });

  it('«Añadir menor» exige los campos como la app y envía el menor a una plaza libre', async () => {
    respuestaDeEscritura = { residenteId: MENOR_ID };
    montar();
    const dialogo = await abrirFormulario();
    const enviar = within(dialogo).getByRole('button', { name: 'Registrar' });
    expect((enviar as HTMLButtonElement).disabled).toBe(true);
    llenar(dialogo, '2008-10-13');
    expect(
      within(dialogo).getByText(
        'Una persona mayor de edad crea su propia cuenta con un código de plaza',
      ),
    ).toBeTruthy();
    expect((enviar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText('Fecha de nacimiento'), {
      target: { value: '2015-08-21' },
    });
    fireEvent.change(within(dialogo).getByLabelText('Número de documento'), {
      target: { value: '109' },
    });
    expect(within(dialogo).getByText('El documento tiene al menos 4 letras o cifras')).toBeTruthy();
    fireEvent.change(within(dialogo).getByLabelText('Número de documento'), {
      target: { value: '1098' },
    });
    expect((enviar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enviar);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Menor registrado en su plaza.'),
    );
    const [e] = await escrituras(espia);
    expect(e).toEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/mi/menores`,
      cuerpo: {
        nombres: 'Mateo',
        apellidos: 'Pérez',
        fechaNacimiento: '2015-08-21',
        parentesco: 'Hijo',
        tipoDocumento: 'tarjeta_identidad',
        numeroDocumento: '1098',
        plazaId: PLAZA_2,
      },
    });
  });

  it('sin plazas libres, «Añadir menor» explica a quién pedir una según quién mira', async () => {
    const sinLibres = vi.fn(async (entrada: string | Request) => {
      const p = typeof entrada === 'string' ? new Request(entrada) : entrada;
      const ruta = new URL(p.url).pathname;
      if (ruta.endsWith('/mi/ocupantes')) {
        return respuesta({
          declarados: 1,
          declarada: true,
          aviso: '',
          tope: 4,
          esTitular: true,
          plazas: [],
        });
      }
      return (await servidorFalso()(entrada)) as Response;
    });
    vi.stubGlobal('fetch', sinLibres);
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Añadir menor' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'No hay plazas libres. Añada una en Ocupantes y vuelva a intentarlo.',
      ),
    );
  });

  it('«Editar» precarga los datos y envía sólo nombre, apellidos, fecha y parentesco', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar menor' });
    expect((within(dialogo).getByLabelText('Nombres') as HTMLInputElement).value).toBe('Sofía');
    expect(within(dialogo).queryByLabelText('Número de documento')).toBeNull();
    fireEvent.change(within(dialogo).getByLabelText(/Parentesco/), {
      target: { value: 'Hija mayor' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Datos guardados.'));
    const [e] = await escrituras(espia);
    expect(e).toEqual({
      metodo: 'PUT',
      ruta: `/copropiedades/${COP}/mi/menores/${MENOR_ID}`,
      cuerpo: {
        nombres: 'Sofía',
        apellidos: 'Pérez',
        fechaNacimiento: '2015-08-21',
        parentesco: 'Hija mayor',
      },
    });
  });

  it('«Dar de baja» exige motivo de 5 letras y avisa que la plaza quedó libre', async () => {
    montar();
    fireEvent.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Dar de baja a Sofía Pérez?' });
    const confirmar = within(dialogo).getByRole('button', { name: 'Dar de baja' });
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: 'nada' } });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: 'se mudó' } });
    fireEvent.click(confirmar);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Se dio de baja a Sofía Pérez. Su plaza quedó libre.',
      ),
    );
    const [e] = await escrituras(espia);
    expect(e).toEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/mi/menores/${MENOR_ID}/baja`,
      cuerpo: { motivo: 'se mudó' },
    });
  });

  it('a los 18, el titular pide el código de traspaso y lo ve una sola vez; otro adulto no lo tiene', async () => {
    const mayor = vi.fn(async (entrada: string | Request) => {
      const p = typeof entrada === 'string' ? new Request(entrada) : entrada;
      if (p.method === 'POST') return respuesta({ codigo: 'MIRA-K7PQ-2XWZ' });
      const ruta = new URL(p.url).pathname;
      if (ruta.endsWith('/mi/menores')) {
        return respuesta([
          {
            residenteId: MENOR_ID,
            nombres: 'Mateo',
            apellidos: 'Pérez',
            nombreCompleto: 'Mateo Pérez',
            fechaNacimiento: '2008-10-01',
            edad: 18,
            tipoDocumento: 'tarjeta_identidad',
            documento: '••••1098',
            parentesco: 'Hijo',
            plazaId: PLAZA_2,
            plazaNumero: 2,
            tieneRostro: false,
          },
        ]);
      }
      return (await servidorFalso()(entrada)) as Response;
    });
    vi.stubGlobal('fetch', mayor);
    const otro = montar(false);
    const filaDeOtro = await screen.findByRole('listitem', { name: 'Mateo Pérez' });
    expect(filaDeOtro.textContent).toMatch(/Ya cumplió 18 años/);
    expect(within(filaDeOtro).queryByRole('button', { name: 'Código para su cuenta' })).toBeNull();
    otro.unmount();

    montar(true);
    const fila = await screen.findByRole('listitem', { name: 'Mateo Pérez' });
    fireEvent.click(within(fila).getByRole('button', { name: 'Código para su cuenta' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Código para Mateo Pérez' });
    expect(within(dialogo).getByText('MIRA-K7PQ-2XWZ')).toBeTruthy();
    expect(within(dialogo).getByText(/Sirve una sola vez/)).toBeTruthy();
    expect(within(dialogo).getByRole('button', { name: /Compartir/ })).toBeTruthy();
    const [e] = await escrituras(mayor);
    expect(e).toEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/mi/menores/${MENOR_ID}/codigo-de-traspaso`,
      cuerpo: null,
    });
  });
});

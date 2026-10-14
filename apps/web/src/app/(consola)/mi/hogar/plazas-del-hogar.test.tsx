import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PlazasDelHogar } from './plazas-del-hogar';
import {
  COP,
  Envoltura,
  PLAZA_2,
  RESPUESTAS,
  conCodigo,
  escrituras,
  respuesta,
  servidorFalso,
} from '../pruebas';

const OCUPANTES = RESPUESTAS[`/api/ncr/copropiedades/${COP}/mi/ocupantes`] as {
  readonly plazas: readonly unknown[];
  readonly tope: number;
};

/** Un servidor que contesta los ocupantes con cambios, y lo demás como siempre. */
const conOcupantes = (cambios: Record<string, unknown>, alEscribir?: () => unknown) =>
  vi.fn(async (entrada: string | Request) => {
    const p = typeof entrada === 'string' ? new Request(entrada) : entrada;
    if (p.method !== 'GET') return respuesta(alEscribir?.() ?? {});
    return respuesta({ ...OCUPANTES, ...cambios });
  });

const montar = (): ReturnType<typeof render> =>
  render(
    <Envoltura>
      <PlazasDelHogar copropiedadId={COP} vivienda="Casa 42 · Manzana B" />
    </Envoltura>,
  );

let espia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  espia = servidorFalso(() => ({ ...OCUPANTES, plazas: [...OCUPANTES.plazas, {}] }));
  vi.stubGlobal('fetch', espia);
});
afterEach(() => vi.unstubAllGlobals());

describe('las plazas del hogar en el perfil (15-Y2)', () => {
  it('los cinco estados: cargando, error, sin permiso, sin conexión y sin declarar', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    );
    const { unmount } = montar();
    expect(screen.getByRole('status').textContent).toMatch(/Cargando las plazas/);
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

    vi.stubGlobal('fetch', conOcupantes({ declarada: false, plazas: [] }));
    montar();
    await waitFor(() => expect(screen.getByLabelText(/Cuántas personas/)).toBeTruthy());
  });

  it('el titular ve el cupo, el código de la plaza libre, el menor sin cuenta y sólo retira la libre', async () => {
    montar();
    await waitFor(() => expect(screen.getByText('Plazas: 3 de 4')).toBeTruthy());
    const lista = screen.getByRole('list', { name: 'Plazas de ocupante' });
    const filas = within(lista).getAllByRole('listitem');
    expect(filas).toHaveLength(3);
    expect(filas[1]!.textContent).toMatch(/Plaza libre/);
    expect(within(filas[1]!).getByText('ABCD-EFGH')).toBeTruthy();
    expect(within(filas[1]!).getByRole('button', { name: /Compartir/ })).toBeTruthy();
    expect(filas[2]!.textContent).toMatch(/Sofía Pérez/);
    expect(filas[2]!.textContent).toMatch(/Menor de edad, sin cuenta/);
    expect(screen.getAllByRole('button', { name: 'Retirar' })).toHaveLength(1);
    expect(within(filas[1]!).getByRole('button', { name: 'Retirar' })).toBeTruthy();
    expect(screen.queryByText(/Sólo el titular/)).toBeNull();
  });

  it('«Añadir plaza» pide una plaza sin cuerpo y avisa con el cupo nuevo', async () => {
    montar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Añadir plaza' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Añadir plaza' }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Plaza añadida. Plazas: 4 de 4.'),
    );
    const [e] = await escrituras(espia);
    expect(e).toEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/mi/ocupantes/plazas`,
      cuerpo: null,
    });
  });

  it('al tope, «Añadir plaza» queda deshabilitado y se dice a quién pedir más', async () => {
    vi.stubGlobal('fetch', conOcupantes({ tope: 3 }));
    montar();
    await waitFor(() => expect(screen.getByText('Plazas: 3 de 3')).toBeTruthy());
    expect(
      (screen.getByRole('button', { name: 'Añadir plaza' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText('Para más plazas, pídalo a la administración')).toBeTruthy();
  });

  it('«Retirar» exige motivo (3 letras) y envía el retiro de ESA plaza', async () => {
    montar();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retirar' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Retirar la plaza 2?' });
    const confirmar = within(dialogo).getByRole('button', { name: 'Retirar' });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: 'ya no' } });
    expect((confirmar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirmar);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Plaza 2 retirada.'));
    const [e] = await escrituras(espia);
    expect(e).toEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/mi/ocupantes/plazas/${PLAZA_2}/retiro`,
      cuerpo: { motivo: 'ya no' },
    });
  });

  it('«Compartir» usa la hoja del sistema si existe y, si no, el portapapeles, y lo dice', async () => {
    const share = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...globalThis.navigator, share, canShare: () => true });
    montar();
    await waitFor(() => expect(screen.getByRole('button', { name: /Compartir/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Compartir/ }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const [datos] = share.mock.calls[0] as unknown as [{ text: string }];
    expect(datos.text).toContain('ABCD-EFGH');
    expect(datos.text).toContain('Casa 42 · Manzana B');
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Código compartido.'));

    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: /Compartir/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/copiado/));
  });

  it('quien no es titular comparte el código pero no añade ni retira', async () => {
    vi.stubGlobal('fetch', conOcupantes({ esTitular: false }));
    montar();
    await waitFor(() => expect(screen.getByText('Plazas: 3 de 4')).toBeTruthy());
    expect(screen.getByRole('button', { name: /Compartir/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Añadir plaza' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirar' })).toBeNull();
    expect(screen.getByText('Sólo el titular de la vivienda añade y retira plazas.')).toBeTruthy();
  });

  it('sin declarar: el titular declara cuántos viven y se envía el número; el resto espera al titular', async () => {
    const servidor = conOcupantes({ declarada: false, plazas: [] }, () => ({ ...OCUPANTES }));
    vi.stubGlobal('fetch', servidor);
    montar();
    const campo = await screen.findByLabelText(/Cuántas personas/);
    fireEvent.change(campo, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Declarar' }));
    await waitFor(async () =>
      expect((await escrituras(servidor))[0]).toEqual({
        metodo: 'POST',
        ruta: `/copropiedades/${COP}/mi/ocupantes`,
        cuerpo: { numero: 3 },
      }),
    );
    vi.stubGlobal('fetch', conOcupantes({ declarada: false, plazas: [], esTitular: false }));
    render(
      <Envoltura>
        <PlazasDelHogar copropiedadId={COP} vivienda="Casa 42" />
      </Envoltura>,
    );
    await waitFor(() => expect(screen.getByText(/El titular todavía no declaró/)).toBeTruthy());
  });
});

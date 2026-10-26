import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PantallaDeMisVisitas } from './pantalla';
import { AUTORIZACION_ID, COP, Envoltura, escrituras, servidorFalso } from '../pruebas';

/**
 * D-143 · decisión del cliente (23/10): la visita puede llegar en carro sin
 * registrar rostro. El residente elige placa o foto, al menos una; la casilla
 * sólo aparece —y sólo viaja— con foto. La foto se sustituye por un botón
 * (jsdom no tiene `createImageBitmap`), como en `formularios.test.tsx`.
 */
vi.mock('@/componentes/captura-de-foto', () => ({
  CapturaDeFoto: ({ alCambiar }: { alCambiar: (f: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        alCambiar({
          contenidoBase64: 'Zm90bw==',
          tipoMime: 'image/jpeg',
          medidas: { rostrosDetectados: 1, nitidez: 0.8, iluminacion: 0.5, proporcionRostro: 0.4 },
        })
      }
    >
      Foto de prueba
    </button>
  ),
}));

let espia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  espia = servidorFalso(() => ({
    creada: true,
    id: AUTORIZACION_ID,
    repetida: false,
    motivo: null,
    explicacion: null,
    motivosDeFoto: [],
    equipos: 0,
    sincronizadas: 0,
    fallidas: 0,
    avisoDeSincronizacion: null,
    confirmacionDePlaca: null,
  }));
  vi.stubGlobal('fetch', espia);
});
afterEach(() => vi.unstubAllGlobals());

const dialogo = (): ReturnType<typeof within> =>
  within(document.querySelector<HTMLElement>('dialog[open]')!);
const escribir = (etiqueta: RegExp, valor: string): void => {
  fireEvent.change(dialogo().getByLabelText(etiqueta), { target: { value: valor } });
};
const registrar = (): HTMLButtonElement =>
  dialogo().getByRole('button', { name: 'Registrar visita' }) as HTMLButtonElement;

describe('D-143 · «Nuevo visitante» con placa y sin foto', () => {
  it('se habilita con la placa, no pide la casilla y envía sin foto ni casilla', async () => {
    render(
      <Envoltura>
        <PantallaDeMisVisitas copropiedadId={COP} />
      </Envoltura>,
    );
    const abrir = (await screen.findByRole('button', {
      name: 'Nuevo visitante',
    })) as HTMLButtonElement;
    await waitFor(() => expect(abrir.disabled).toBe(false));
    fireEvent.click(abrir);

    escribir(/Nombre del visitante/, 'Carla Ruiz');
    escribir(/Número de documento/, '12345678');
    escribir(/Fecha de la visita/, '2026-10-30');
    escribir(/Hora de llegada/, '15:30');
    expect(registrar().disabled).toBe(true);
    expect(dialogo().getByRole('note').textContent).toMatch(/hace falta al menos una/);

    escribir(/Placa del vehículo/, 'abc-123');
    expect(dialogo().queryByLabelText(/Declaro que/)).toBeNull();
    expect(registrar().disabled).toBe(false);
    fireEvent.click(registrar());

    await waitFor(async () => expect((await escrituras(espia)).length).toBe(1));
    const [e] = await escrituras(espia);
    const cuerpo = e?.cuerpo as Record<string, unknown>;
    expect(cuerpo['placa']).toBe('ABC123');
    expect(cuerpo).not.toHaveProperty('foto');
    expect(cuerpo).not.toHaveProperty('casillaMarcada');
    expect(await screen.findByText(/Sin foto: entra por la placa/)).toBeTruthy();
  });

  it('si se toma la foto, la casilla aparece y vuelve a ser obligatoria', async () => {
    render(
      <Envoltura>
        <PantallaDeMisVisitas copropiedadId={COP} />
      </Envoltura>,
    );
    const abrir = (await screen.findByRole('button', {
      name: 'Nuevo visitante',
    })) as HTMLButtonElement;
    await waitFor(() => expect(abrir.disabled).toBe(false));
    fireEvent.click(abrir);
    escribir(/Nombre del visitante/, 'Carla Ruiz');
    escribir(/Número de documento/, '12345678');
    escribir(/Placa del vehículo/, 'abc-123');
    fireEvent.click(dialogo().getByRole('button', { name: 'Foto de prueba' }));
    expect(dialogo().getByLabelText(/Declaro que Carla Ruiz me autorizó/)).toBeTruthy();
    expect(registrar().disabled).toBe(true);
  });
});

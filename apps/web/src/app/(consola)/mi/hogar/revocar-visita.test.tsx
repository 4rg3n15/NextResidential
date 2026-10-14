import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PantallaDeMisVisitas } from '../visitas/pantalla';
import {
  AUTORIZACION_ID,
  COP,
  Envoltura,
  RESPUESTAS,
  escrituras,
  respuesta,
  servidorFalso,
} from '../pruebas';

const VIGENTE = {
  ...((
    RESPUESTAS[`/api/ncr/copropiedades/${COP}/mi/autorizaciones`] as readonly unknown[]
  )[0] as object),
  situacion: 'vigente',
  motivoRechazo: null,
};

/** Las autorizaciones con una vigente y una rechazada; las escrituras contestan `escritura`. */
const servidor = (escritura: unknown) =>
  vi.fn(async (entrada: string | Request) => {
    const p = typeof entrada === 'string' ? new Request(entrada) : entrada;
    if (p.method !== 'GET') return respuesta(escritura);
    if (new URL(p.url).pathname.endsWith('/mi/autorizaciones')) {
      return respuesta([
        VIGENTE,
        { ...VIGENTE, id: 'otra', visitante: 'Pedro Gil', situacion: 'rechazada' },
      ]);
    }
    return (await servidorFalso()(entrada)) as Response;
  });

let espia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  espia = servidor({
    revocada: true,
    rostrosSuprimidos: 1,
    equiposRetirados: 2,
    equiposPendientes: 1,
  });
  vi.stubGlobal('fetch', espia);
});
afterEach(() => vi.unstubAllGlobals());

describe('revocar una visita propia (15-Y2, D-W6)', () => {
  it('sólo la vigente o programada tiene «Revocar»; la rechazada, no', async () => {
    render(
      <Envoltura>
        <PantallaDeMisVisitas copropiedadId={COP} />
      </Envoltura>,
    );
    const lista = await screen.findByRole('list', { name: 'Mis autorizaciones' });
    await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(2));
    expect(within(lista).getAllByRole('button', { name: 'Revocar' })).toHaveLength(1);
  });

  it('pide motivo, envía la revocación de ESA autorización y cuenta los equipos como la app', async () => {
    render(
      <Envoltura>
        <PantallaDeMisVisitas copropiedadId={COP} />
      </Envoltura>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Revocar' }));
    const dialogo = screen.getByRole('dialog', { name: '¿Revocar la visita de Carla Ruiz?' });
    expect(dialogo.textContent).toMatch(/su foto sale de los equipos/);
    const confirmar = within(dialogo).getByRole('button', { name: 'Revocar' });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: 'ya vino' } });
    fireEvent.click(confirmar);
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Visita revocada. Su foto salió de 2 equipo(s); 1 más la retirará en cuanto responda.',
      ),
    );
    const [e] = await escrituras(espia);
    expect(e).toEqual({
      metodo: 'POST',
      ruta: `/copropiedades/${COP}/mi/visitas/${AUTORIZACION_ID}/revocacion`,
      cuerpo: { motivo: 'ya vino' },
    });
  });
});

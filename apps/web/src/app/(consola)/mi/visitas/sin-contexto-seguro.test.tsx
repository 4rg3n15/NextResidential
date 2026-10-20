import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PantallaDeMisVisitas } from './pantalla';
import { NuevaVisita } from './nueva-visita';
import { VolverAAutorizar } from './volver-a-autorizar';
import { COP, Envoltura, escrituras, servidorFalso } from '../pruebas';

/** jsdom no tiene `createImageBitmap`: la foto se sustituye por un botón (como en formularios.test). */
vi.mock('@/componentes/captura-de-foto', () => ({
  CapturaDeFoto: () => <span>Foto de prueba</span>,
}));

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * El teléfono abría `http://<IP de LAN>:3100/mi/visitas` y la pantalla quedaba
 * en negro: `crypto.randomUUID` sólo existe en un contexto seguro (HTTPS o
 * localhost) y `VolverAAutorizar` lo llamaba al pintarse. Aquí el navegador es
 * ese: `getRandomValues` sí, `randomUUID` no.
 */
let espia: ReturnType<typeof vi.fn>;
beforeEach(() => {
  espia = servidorFalso(() => ({ creada: true, id: 'x', motivo: null, explicacion: null }));
  vi.stubGlobal('fetch', espia);
  vi.stubGlobal('crypto', {
    getRandomValues: <T extends ArrayBufferView>(a: T): T => webcrypto.getRandomValues(a as never),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('«Visitas» por HTTP en una IP de LAN (sin contexto seguro)', () => {
  it('NuevaVisita y VolverAAutorizar se pintan sin randomUUID, cerrados y abiertos', () => {
    expect(globalThis.crypto.randomUUID).toBeUndefined();
    expect(() =>
      render(
        <Envoltura>
          <NuevaVisita
            copropiedadId={COP}
            abierto
            alCerrar={() => undefined}
            alRegistrar={() => undefined}
          />
          <VolverAAutorizar
            copropiedadId={COP}
            visitante={null}
            alCerrar={() => undefined}
            alRegistrar={() => undefined}
          />
        </Envoltura>,
      ),
    ).not.toThrow();
    expect(screen.getByText('Foto de prueba')).toBeTruthy();
  });

  it('la pantalla abre y «Volver a autorizar» envía una clave UUID v4', async () => {
    render(
      <Envoltura>
        <PantallaDeMisVisitas copropiedadId={COP} />
      </Envoltura>,
    );
    const boton = (await screen.findByRole('button', {
      name: 'Volver a autorizar',
    })) as HTMLButtonElement;
    await waitFor(() => expect(boton.disabled).toBe(false));
    fireEvent.click(boton);
    const dialogo = within(document.querySelector<HTMLElement>('dialog[open]')!);
    fireEvent.click(dialogo.getByLabelText(/Declaro que Carla Ruiz me autorizó/));
    fireEvent.click(dialogo.getByRole('button', { name: 'Autorizar de nuevo' }));
    await waitFor(async () => expect((await escrituras(espia)).length).toBe(1));
    const [e] = await escrituras(espia);
    expect((e?.cuerpo as { claveDeIdempotencia: string }).claveDeIdempotencia).toMatch(UUID_V4);
  });
});

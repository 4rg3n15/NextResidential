import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PantallaDeBiometria } from './pantalla';

/**
 * LA PANTALLA DE CAPTURA, MONTADA DE VERDAD.
 *
 * Lo que se fija aquí no es la maquetación: son las tres cosas que esta
 * pantalla **no puede** hacer aunque alguien la reescriba.
 *
 *  1. No hay forma de aceptar el consentimiento desde aquí (RN-10). Lo
 *     responde el titular, por su canal.
 *  2. No se pide ningún identificador interno a mano (D-72): el titular sale
 *     del buscador compartido.
 *  3. Sin detector de rostros no se inventa uno. Se dice, y hace falta la
 *     confirmación de quien opera.
 *
 * Por eso esta pantalla está declarada en `SIN_FORMULARIO` del barrido de
 * formularios: no abre diálogo ni tiene botón de envío dentro de uno, así que
 * el recorrido genérico no la alcanza. Lo que aquel comprueba, lo comprueba
 * esto, y con lo específico de una captura biométrica encima.
 */

const COP = '10000000-0000-4000-8000-000000000001';

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
  >
    {children}
  </QueryClientProvider>
);

const montar = (): void => {
  render(
    <Envoltura>
      <PantallaDeBiometria copropiedadId={COP} />
    </Envoltura>,
  );
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  );
  // Sin detector: es el caso que hay que ejercitar, y el de la mayoría de los
  // navegadores de escritorio de hoy.
  vi.stubGlobal('FaceDetector', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('lo que esta pantalla NO puede hacer', () => {
  it('no ofrece ningún modo de ACEPTAR el consentimiento', async () => {
    // Un botón de «aceptar» aquí convertiría el consentimiento en un trámite
    // que rellena el operador, que es lo que la Ley 1581 no admite.
    montar();
    await waitFor(() => expect(screen.getByText(/Rostro del visitante/)).toBeTruthy());

    const botones = screen.getAllByRole('button').map((b) => b.textContent ?? '');
    expect(botones.some((t) => /acept|consiento|autorizo/i.test(t))).toBe(false);
    // Y lo dice con todas las letras.
    expect(screen.getByText(/lo responde él, por su canal/i)).toBeTruthy();
  });

  it('ningún campo de texto pide un identificador interno (D-72)', async () => {
    montar();
    await waitFor(() => expect(screen.getByText(/Rostro del visitante/)).toBeTruthy());

    for (const etiqueta of Array.from(document.querySelectorAll('label'))) {
      expect(etiqueta.textContent ?? '', etiqueta.textContent ?? '').not.toMatch(
        /identificador|uuid|\bid\b/i,
      );
    }
  });

  it('nombra al TITULAR como el visitante, no como el residente (RN-10)', async () => {
    montar();
    await waitFor(() => expect(screen.getByText(/Rostro del visitante/)).toBeTruthy());
    expect(screen.getByText(/Es el visitante, no el residente/i)).toBeTruthy();
  });

  it('el botón de envío nace deshabilitado: sin titular y sin foto no hay captura', async () => {
    montar();
    await waitFor(() => expect(screen.getByText(/Rostro del visitante/)).toBeTruthy());
    const enviar = screen
      .getAllByRole('button')
      .find((b) => /Solicitar consentimiento/.test(b.textContent ?? ''));
    expect(enviar).toBeTruthy();
    expect((enviar as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('la minimización se anuncia, no se supone', () => {
  it('dice que la imagen se reduce en este navegador y que la original no sale', async () => {
    montar();
    await waitFor(() => expect(screen.getByText(/Rostro del visitante/)).toBeTruthy());
    expect(screen.getByText(/La original no sale de este equipo/i)).toBeTruthy();
  });

  it('dice que sin consentimiento no se sincroniza con ninguna terminal (RN-09)', async () => {
    montar();
    await waitFor(() => expect(screen.getByText(/Rostro del visitante/)).toBeTruthy());
    expect(screen.getByText(/no se sincroniza con ninguna terminal/i)).toBeTruthy();
  });
});

describe('el fichero que no es una imagen', () => {
  it('no deja la pantalla a medias: lo dice y no prepara nada', async () => {
    montar();
    await waitFor(() => expect(screen.getByText(/Rostro del visitante/)).toBeTruthy());

    // `createImageBitmap` no existe en el entorno de pruebas; que falle es
    // exactamente el camino que se quiere recorrer.
    const entrada = screen.getByLabelText(/Fotografía del rostro/i);
    const fichero = new File(['no soy una imagen'], 'x.txt', { type: 'text/plain' });
    fireEvent.change(entrada, { target: { files: [fichero] } });

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent ?? '').toMatch(/No se pudo leer la imagen/i),
    );
  });
});

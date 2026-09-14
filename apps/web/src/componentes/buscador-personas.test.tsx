import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BuscadorDePersonas } from './buscador-personas';
import type { PersonaElegida } from './buscador-personas';

/**
 * D-72 · lo que se comprueba aquí es que la identidad quede **bien formada sin
 * que nadie sepa qué es un UUID**: se teclea un nombre, se elige de la lista, y
 * lo que sale del componente es un identificador válido.
 *
 * Y el caso que de verdad importa para RN-06: si el documento ya existía, el
 * componente NO puede fingir que creó a alguien. Lo dice.
 */
const COP = '10000000-0000-4000-8000-000000000001';

const PERSONA = {
  id: '20000000-0000-4000-8000-0000000000aa',
  nombreCompleto: 'Ana Pérez',
  tipoDocumento: 'cedula',
  numeroDocumento: '12345678',
  esResidente: true,
  viviendaIdentificador: 'Casa 12',
};

const respuesta = (cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

let altaDevuelve: { id: string; nombreCompleto: string; yaExistia: boolean } = {
  id: '20000000-0000-4000-8000-0000000000bb',
  nombreCompleto: 'Luis Gómez',
  yaExistia: false,
};

const servidorFalso = (): ReturnType<typeof vi.fn> =>
  vi.fn(async (entrada: string | Request) => {
    const peticion = typeof entrada === 'string' ? null : entrada;
    if (peticion?.method === 'POST') return respuesta(altaDevuelve);
    return respuesta([PERSONA]);
  });

/** Anfitrión con estado real: hace falta para ver el chip resuelto y su aviso. */
const ConEstado = (): JSX.Element => {
  const [elegida, setElegida] = useState<PersonaElegida | null>(null);
  return <BuscadorDePersonas copropiedadId={COP} elegida={elegida} alElegir={setElegida} />;
};

const Montado = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
  >
    {children}
  </QueryClientProvider>
);

const montar = (): { readonly elegidas: (PersonaElegida | null)[] } => {
  const elegidas: (PersonaElegida | null)[] = [];
  const Anfitrion = (): JSX.Element => (
    <BuscadorDePersonas
      copropiedadId={COP}
      elegida={null}
      alElegir={(p) => elegidas.push(p)}
      etiqueta="Persona que visita"
    />
  );
  render(
    <Montado>
      <Anfitrion />
    </Montado>,
  );
  return { elegidas };
};

beforeEach(() => {
  vi.stubGlobal('fetch', servidorFalso());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('BuscadorDePersonas', () => {
  it('con un nombre encuentra a la persona y devuelve su identificador', async () => {
    const { elegidas } = montar();
    const campo = screen.getByRole('combobox', { name: /Persona que visita/ });
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: 'Ana' } });

    const opcion = await screen.findByRole('option', { name: /Ana Pérez/ });
    // Y desambigua a los homónimos: sin la vivienda, dos «Ana Pérez» son la
    // misma fila para quien elige.
    expect(opcion.textContent).toMatch(/residente de Casa 12/);
    fireEvent.click(opcion);

    expect(elegidas).toEqual([
      { id: PERSONA.id, nombreCompleto: 'Ana Pérez', documento: '12345678' },
    ]);
  });

  it('no consulta con una sola letra', async () => {
    montar();
    const campo = screen.getByRole('combobox', { name: /Persona que visita/ });
    fireEvent.change(campo, { target: { value: 'A' } });
    await new Promise((r) => setTimeout(r, 400));
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('permite registrar a quien no aparece, sin salir del formulario', async () => {
    altaDevuelve = {
      id: '20000000-0000-4000-8000-0000000000bb',
      nombreCompleto: 'Luis Gómez',
      yaExistia: false,
    };
    const { elegidas } = montar();
    const campo = screen.getByRole('combobox', { name: /Persona que visita/ });
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: 'Luis Gómez' } });

    fireEvent.click(await screen.findByRole('button', { name: /Registrar a «Luis Gómez»/ }));
    // Lo tecleado se reparte solo: era texto, luego es el nombre.
    expect((screen.getByLabelText(/Nombre completo/) as HTMLInputElement).value).toBe('Luis Gómez');
    fireEvent.change(screen.getByLabelText(/Número de documento/), {
      target: { value: '98.765.432' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Registrar y usar/ }));

    await waitFor(() => expect(elegidas).toHaveLength(1));
    expect(elegidas[0]?.id).toBe(altaDevuelve.id);
  });

  it('si el documento ya existía lo DICE, en vez de fingir que creó a alguien (RN-06)', async () => {
    altaDevuelve = { id: PERSONA.id, nombreCompleto: 'Ana Pérez', yaExistia: true };
    render(
      <Montado>
        <ConEstado />
      </Montado>,
    );
    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Ana' } });
    fireEvent.click(await screen.findByRole('button', { name: /Registrar a «Ana»/ }));
    fireEvent.change(screen.getByLabelText(/Número de documento/), {
      target: { value: '12345678' },
    });
    fireEvent.change(screen.getByLabelText(/Nombre completo/), { target: { value: 'Ana P' } });
    fireEvent.click(screen.getByRole('button', { name: /Registrar y usar/ }));

    const aviso = await screen.findByRole('status');
    expect(aviso.textContent).toMatch(/ya estaba registrado como «Ana Pérez»/);
  });
});

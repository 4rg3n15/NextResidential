import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PantallaDeResidentes } from './pantalla';

/**
 * RONDA 15-W · CADA VIVIENDA TIENE UN TITULAR, Y LO DA DE ALTA LA ADMINISTRACIÓN.
 *
 * Lo que estas pruebas protegen es lo que el panel AFIRMA y podría desmentir
 * sin que nadie lo note: que el alta no sale sin una vivienda elegida de la
 * lista de la API (nadie teclea un identificador), que el 409 de «ya tiene
 * titular» se lee tal cual, que «Asignar vivienda» sólo aparece donde sirve
 * —una cuenta ACTIVA sin vivienda: a una de baja la API le respondería 404— y
 * que el cuerpo que viaja es exactamente el del contrato. El doble de `fetch`
 * enruta por método y ruta, y LEE los cuerpos: contestar 200 a todo sin
 * mirarlos es lo que ya dejó pasar defectos en este proyecto.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const ANA = '00000000-0000-4000-8000-0000000000a1';
const LUIS = '00000000-0000-4000-8000-0000000000a2';
const MARTA = '00000000-0000-4000-8000-0000000000a3';
const EVA = '00000000-0000-4000-8000-0000000000a4';
const LIBRE_7 = '30000000-0000-4000-8000-000000000007';
const LIBRE_9 = '30000000-0000-4000-8000-000000000009';
const BASE = `/copropiedades/${COP}`;

const cuenta = (
  usuarioId: string,
  nombre: string,
  vivienda: string | null,
  origen: 'administracion' | 'autorregistro',
  activa = true,
): Record<string, unknown> => ({
  usuarioId,
  usuario: nombre.toLowerCase().replace(/\s+/g, '.'),
  nombre,
  vivienda,
  activa,
  debeCambiarContrasena: false,
  creadaEn: '2026-10-01T10:00:00.000Z',
  origen,
});

const CUENTAS = [
  cuenta(ANA, 'Ana Pérez', 'B · 42', 'administracion'),
  cuenta(LUIS, 'Luis Gómez', null, 'administracion'),
  cuenta(MARTA, 'Marta Ruiz', 'B · 42', 'autorregistro'),
  cuenta(EVA, 'Eva Díaz', null, 'administracion', false),
];

type Respuesta = { readonly estado?: number; readonly cuerpo: unknown };
let rutas: Record<string, (p: Request) => Respuesta>;
let fetchFalso: ReturnType<typeof vi.fn>;

const conflicto = (mensaje: string): Respuesta => ({
  estado: 409,
  cuerpo: { estado: 409, correlacion: 'x', mensaje: { message: mensaje, statusCode: 409 } },
});

beforeEach(() => {
  rutas = {
    [`GET ${BASE}/residentes/cuentas`]: () => ({ cuerpo: CUENTAS }),
    [`GET ${BASE}/residentes/vehiculos`]: () => ({ cuerpo: [] }),
    [`GET ${BASE}/padron/viviendas`]: () => ({
      cuerpo: { totales: { activas: 0, inactivas: 0 }, viviendas: [] },
    }),
    [`GET ${BASE}/residentes/viviendas-sin-titular`]: () => ({
      cuerpo: [
        { id: LIBRE_7, identificador: '7', agrupacion: 'A' },
        { id: LIBRE_9, identificador: '9', agrupacion: null },
      ],
    }),
    [`POST ${BASE}/residentes/cuentas`]: () => ({ cuerpo: { usuarioId: MARTA } }),
    [`POST ${BASE}/residentes/cuentas/${LUIS}/vivienda`]: () => ({ cuerpo: { asignada: true } }),
  };
  fetchFalso = vi.fn(async (p: Request) => {
    const ruta = new URL(p.url).pathname.replace('/api/ncr', '');
    const r = rutas[`${p.method} ${ruta}`]?.(p) ?? { estado: 404, cuerpo: { estado: 404 } };
    return new Response(JSON.stringify(r.cuerpo), {
      status: r.estado ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchFalso);
});
afterEach(() => vi.unstubAllGlobals());

const envolver = (hijo: ReactNode) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {hijo}
  </QueryClientProvider>
);

const peticiones = (metodo: string, sufijo: string): Request[] =>
  fetchFalso.mock.calls
    .map(([p]) => p as Request)
    .filter((p) => p.method === metodo && new URL(p.url).pathname.endsWith(sufijo));

const filaDe = async (nombre: string): Promise<HTMLElement> => {
  const tabla = await screen.findByRole('table', { name: /Cuentas de residentes/ });
  const fila = within(tabla).getByText(nombre).closest('tr');
  if (fila === null) throw new Error(`sin fila para ${nombre}`);
  return fila;
};

/** Abre el alta y rellena todo MENOS la vivienda. */
const abrirAltaSinVivienda = async (): Promise<HTMLElement> => {
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo residente' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Nuevo residente' });
  fireEvent.change(within(dialogo).getByLabelText(/^Usuario/), { target: { value: 'casa7.leo' } });
  fireEvent.change(within(dialogo).getByLabelText(/Contraseña inicial/), {
    target: { value: 'Inicial#2026' },
  });
  fireEvent.change(within(dialogo).getByLabelText(/^Nombre(?!s)/), {
    target: { value: 'Leo Mora' },
  });
  return dialogo;
};

const elegirVivienda = async (dialogo: HTMLElement, id: string): Promise<void> => {
  const selector = within(dialogo).getByLabelText('Vivienda sin titular');
  await waitFor(() => expect(within(selector).getAllByRole('option')).toHaveLength(3));
  fireEvent.change(selector, { target: { value: id } });
};

describe('15-W · la tabla de cuentas dice de dónde salió cada una y cuál no tiene vivienda', () => {
  it('«Origen» distingue la administración de «Crear cuenta» en la app; sin vivienda lo dice', async () => {
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    expect(within(await filaDe('Ana Pérez')).getByText('Administración')).toBeTruthy();
    expect(within(await filaDe('Marta Ruiz')).getByText('Crear cuenta (app)')).toBeTruthy();
    expect(within(await filaDe('Luis Gómez')).getByText('Sin vivienda')).toBeTruthy();
  });

  it('«Asignar vivienda» sólo en las cuentas ACTIVAS sin vivienda', async () => {
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    const tabla = await screen.findByRole('table', { name: /Cuentas de residentes/ });
    expect(within(tabla).getAllByRole('button', { name: 'Asignar vivienda' })).toHaveLength(1);
    expect(
      within(await filaDe('Luis Gómez')).getByRole('button', { name: 'Asignar vivienda' }),
    ).toBeTruthy();
    for (const nombre of ['Ana Pérez', 'Marta Ruiz', 'Eva Díaz']) {
      expect(
        within(await filaDe(nombre)).queryByRole('button', { name: 'Asignar vivienda' }),
      ).toBeNull();
    }
  });
});

describe('15-W · el alta es la del TITULAR de una vivienda sin titular', () => {
  it('explica el titular, el cambio de contraseña y el código de plaza', async () => {
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo residente' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo residente' });
    expect(dialogo.textContent).toMatch(/titular/i);
    expect(dialogo.textContent).toMatch(/cambiar.*primer ingreso/i);
    expect(dialogo.textContent).toMatch(/código de plaza/i);
  });

  it('sin vivienda elegida no se puede dar de alta; elegida, viaja su id', async () => {
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    const dialogo = await abrirAltaSinVivienda();
    const enviar = within(dialogo).getByRole('button', { name: 'Dar de alta' });
    expect((enviar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(enviar);
    expect(peticiones('POST', '/residentes/cuentas')).toHaveLength(0);

    await elegirVivienda(dialogo, LIBRE_7);
    expect((enviar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enviar);
    await waitFor(() => expect(peticiones('POST', '/residentes/cuentas')).toHaveLength(1));
    expect(await peticiones('POST', '/residentes/cuentas')[0]?.clone().json()).toEqual({
      usuario: 'casa7.leo',
      contrasenaInicial: 'Inicial#2026',
      nombre: 'Leo Mora',
      viviendaId: LIBRE_7,
    });
  });

  it('la búsqueda la hace el servidor (?q=) y, sin resultados, lo dice', async () => {
    rutas[`GET ${BASE}/residentes/viviendas-sin-titular`] = (p) => ({
      cuerpo:
        new URL(p.url).searchParams.get('q') === 'zz'
          ? []
          : [{ id: LIBRE_7, identificador: '7', agrupacion: 'A' }],
    });
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Nuevo residente' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nuevo residente' });
    expect(await within(dialogo).findByText('1 vivienda sin titular.')).toBeTruthy();
    // Dos teclas a 50 ms, menos que la espera: sólo viaja la última. (Sin
    // pausa entre ellas, hasta una espera de 0 ms pasaría la prueba.)
    const buscar = within(dialogo).getByLabelText('Buscar vivienda');
    fireEvent.change(buscar, { target: { value: ' z' } });
    await new Promise((listo) => setTimeout(listo, 50));
    fireEvent.change(buscar, { target: { value: ' zz ' } });
    expect(
      await within(dialogo).findByText('Ninguna vivienda sin titular coincide con «zz».'),
    ).toBeTruthy();
    const pedidas = peticiones('GET', '/residentes/viviendas-sin-titular').map((p) =>
      new URL(p.url).searchParams.get('q'),
    );
    expect(pedidas).toEqual(['', 'zz']);
  });

  it('el 409 de «ya tiene titular» se enseña tal cual, sin cerrar el diálogo', async () => {
    const mensaje = 'Esta vivienda ya tiene titular: los demás entran con un código de plaza';
    rutas[`POST ${BASE}/residentes/cuentas`] = () => conflicto(mensaje);
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    const dialogo = await abrirAltaSinVivienda();
    await elegirVivienda(dialogo, LIBRE_9);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Dar de alta' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toBe(mensaje);
    expect(screen.getByRole('dialog', { name: 'Nuevo residente' })).toBeTruthy();
  });
});

describe('15-W · una cuenta antigua sin vivienda recibe la suya, con motivo', () => {
  it('exige vivienda y motivo, envía { viviendaId, motivo } y vuelve a pedir la lista', async () => {
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    fireEvent.click(
      within(await filaDe('Luis Gómez')).getByRole('button', { name: 'Asignar vivienda' }),
    );
    const dialogo = await screen.findByRole('dialog', { name: /Asignar vivienda a Luis Gómez/ });
    const enviar = within(dialogo).getByRole('button', { name: 'Asignar vivienda' });
    expect((enviar as HTMLButtonElement).disabled).toBe(true);

    await elegirVivienda(dialogo, LIBRE_7);
    expect((enviar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: 'nada' } });
    expect((enviar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), {
      target: { value: '  Cuenta   anterior al titular  ' },
    });
    expect((enviar as HTMLButtonElement).disabled).toBe(false);

    const listasAntes = peticiones('GET', '/residentes/cuentas').length;
    fireEvent.click(enviar);
    await waitFor(() =>
      expect(peticiones('POST', `/residentes/cuentas/${LUIS}/vivienda`)).toHaveLength(1),
    );
    expect(
      await peticiones('POST', `/residentes/cuentas/${LUIS}/vivienda`)[0]?.clone().json(),
    ).toEqual({ viviendaId: LIBRE_7, motivo: 'Cuenta anterior al titular' });
    await waitFor(() =>
      expect(peticiones('GET', '/residentes/cuentas').length).toBeGreaterThan(listasAntes),
    );
    expect(await screen.findByText(/Luis Gómez quedó como titular de A · 7/)).toBeTruthy();
  });

  it('el 409 de la API se lee en el diálogo', async () => {
    rutas[`POST ${BASE}/residentes/cuentas/${LUIS}/vivienda`] = () =>
      conflicto('Esa cuenta ya tiene vivienda');
    render(envolver(<PantallaDeResidentes copropiedadId={COP} />));
    fireEvent.click(
      within(await filaDe('Luis Gómez')).getByRole('button', { name: 'Asignar vivienda' }),
    );
    const dialogo = await screen.findByRole('dialog', { name: /Asignar vivienda a Luis Gómez/ });
    await elegirVivienda(dialogo, LIBRE_9);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), {
      target: { value: 'Lo pidió en portería' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Asignar vivienda' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toBe(
      'Esa cuenta ya tiene vivienda',
    );
  });
});

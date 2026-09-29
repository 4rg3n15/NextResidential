import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PantallaDeInicio } from './inicio';
import { PantallaDeFamilia } from './familia/pantalla';
import { PantallaDeMisVehiculos } from './vehiculos/pantalla';
import { PantallaDeMisVisitas } from './visitas/pantalla';
import { PantallaDeMisZonas } from './zonas/pantalla';
import { PantallaDeMiHistorial } from './historial/pantalla';
import { PantallaDeMisNotificaciones } from './notificaciones/pantalla';
import { PantallaDeMiPerfil } from './perfil/pantalla';
import { COP, Envoltura, conCodigo, nombreAccesible, servidorFalso } from './pruebas';

/**
 * 15-M (C3) · LAS OCHO PANTALLAS DEL RESIDENTE SE MONTAN DE VERDAD, con datos,
 * vacías y con cada fallo: es la misma batería que la consola ya exige a las
 * pantallas de operación (`pantallas-render`, `estados-de-pantalla`,
 * `accesibilidad`), aquí para las del residente porque comparten servidor
 * falso propio: sus rutas cuelgan de `/mi/…` y no del padrón.
 */
const PANTALLAS: readonly {
  readonly nombre: string;
  readonly montar: () => JSX.Element;
  /** Texto que sólo aparece con DATOS: sin él se mediría el esqueleto. */
  readonly senal: RegExp;
  readonly vacio: RegExp;
}[] = [
  {
    nombre: 'mi vivienda',
    montar: () => <PantallaDeInicio copropiedadId={COP} />,
    senal: /Casa 42 · Manzana B/,
    vacio: /Sin visitas autorizadas/,
  },
  {
    nombre: 'mi familia',
    montar: () => <PantallaDeFamilia copropiedadId={COP} />,
    senal: /Luis Pérez/,
    vacio: /Sin residentes registrados/,
  },
  {
    nombre: 'mis vehículos',
    montar: () => <PantallaDeMisVehiculos copropiedadId={COP} />,
    senal: /RES123/,
    vacio: /Sin vehículos registrados/,
  },
  {
    nombre: 'visitas',
    montar: () => <PantallaDeMisVisitas copropiedadId={COP} />,
    senal: /Carla Ruiz/,
    vacio: /Todavía no has autorizado/,
  },
  {
    nombre: 'zonas comunes',
    montar: () => <PantallaDeMisZonas copropiedadId={COP} />,
    senal: /Piscina/,
    vacio: /Sin zonas comunes/,
  },
  {
    nombre: 'historial',
    montar: () => <PantallaDeMiHistorial copropiedadId={COP} />,
    senal: /Carla Ruiz/,
    vacio: /Sin accesos en el periodo/,
  },
  {
    nombre: 'notificaciones',
    montar: () => <PantallaDeMisNotificaciones copropiedadId={COP} />,
    senal: /Pedro Gil/,
    vacio: /Todavía no hay avisos/,
  },
  {
    nombre: 'perfil',
    montar: () => <PantallaDeMiPerfil copropiedadId={COP} />,
    senal: /ana@correo\.invalid/,
    vacio: /Mis datos/,
  },
];

beforeEach(() => vi.stubGlobal('fetch', servidorFalso()));
afterEach(() => vi.unstubAllGlobals());

const montar = async (p: (typeof PANTALLAS)[number]): Promise<void> => {
  render(<Envoltura>{p.montar()}</Envoltura>);
  await waitFor(() => expect(screen.getAllByText(p.senal).length).toBeGreaterThan(0));
};

describe('cada pantalla se pinta con datos, vacía y dice cada fallo', () => {
  for (const p of PANTALLAS) {
    it(`${p.nombre}: con datos, un solo h1 y ningún control sin nombre`, async () => {
      await montar(p);
      expect(document.querySelectorAll('h1')).toHaveLength(1);
      expect(
        document.querySelector('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])'),
      ).toBeNull();
      const controles = document.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href]',
      );
      for (const c of Array.from(controles)) {
        expect(nombreAccesible(c), `${c.tagName} sin nombre accesible`).not.toBe('');
      }
      expect(document.body.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/i);
    });

    it(`${p.nombre}: sin datos lo dice, no deja la vista en blanco`, async () => {
      vi.stubGlobal(
        'fetch',
        servidorFalso(() => ({}), true),
      );
      render(<Envoltura>{p.montar()}</Envoltura>);
      await waitFor(() => expect(screen.getAllByText(p.vacio).length).toBeGreaterThan(0));
    });

    it(`${p.nombre}: mientras carga anuncia el estado`, () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<Response>(() => undefined)),
      );
      render(<Envoltura>{p.montar()}</Envoltura>);
      expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
    });

    it(`${p.nombre}: 403 dice «Sin permiso»`, async () => {
      vi.stubGlobal('fetch', conCodigo(403));
      render(<Envoltura>{p.montar()}</Envoltura>);
      await waitFor(() => expect(screen.getAllByText('Sin permiso').length).toBeGreaterThan(0));
    });

    it(`${p.nombre}: 500 ofrece reintentar`, async () => {
      vi.stubGlobal('fetch', conCodigo(500));
      render(<Envoltura>{p.montar()}</Envoltura>);
      await waitFor(() =>
        expect(screen.getAllByRole('button', { name: 'Reintentar' }).length).toBeGreaterThan(0),
      );
    });
  }
});

describe('lo que cada pantalla debe decir', () => {
  it('mi vivienda: estado administrativo legible, titular, atajos y actividad con la fecha en los dos extremos', async () => {
    await montar(PANTALLAS[0]!);
    expect(screen.getByText('Al día')).toBeTruthy();
    expect(screen.getByText(/Eres el titular/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Registrar visita/ })).toBeTruthy();
    expect(screen.getByText(/29-09-2026 \d\d:00 – 29-09-2026 \d\d:00/)).toBeTruthy();
    expect(screen.getByText('Rechazada')).toBeTruthy();
    expect(screen.getByText(/Motivo: No coincide la foto/)).toBeTruthy();
    expect(document.body.textContent).not.toContain('al_dia');
  });

  it('mi familia: parentesco, titular y nivel legibles; el desactivado se ve y no desaparece', async () => {
    await montar(PANTALLAS[1]!);
    expect(screen.getByText(/Titular · Acceso completo/)).toBeTruthy();
    expect(screen.getByText(/Hijo · Solo ingreso/)).toBeTruthy();
    expect(screen.getByText('Desactivado')).toBeTruthy();
    expect(screen.getByText(/1 residente\(s\)/)).toBeTruthy();
  });

  it('zonas comunes: aforo como medidor con nombre, plazas que quedan, horario de hoy y la nota de autorización', async () => {
    await montar(PANTALLAS[4]!);
    expect(screen.getByRole('meter', { name: '18 de 20 plazas ocupadas' })).toBeTruthy();
    expect(screen.getByText('Quedan 2 de 20 plazas')).toBeTruthy();
    expect(screen.getByText(/Hoy: \d\d:\d\d–\d\d:\d\d/)).toBeTruthy();
    expect(screen.getByText('Abierta')).toBeTruthy();
    expect(screen.getByText(/necesitan que les autorices esta zona/)).toBeTruthy();
  });

  it('historial: el motivo de la negación en castellano, el Edge marcado y el periodo se pide de nuevo', async () => {
    await montar(PANTALLAS[5]!);
    expect(screen.getByText('Persona o placa en lista negra')).toBeTruthy();
    expect(screen.getByText('Decidido en el conjunto, sin nube')).toBeTruthy();
    expect(
      screen.getByText(/29-09-2026 \d\d:05 · Por placa · Entrada vehicular · VIS456 · Visitante/),
    ).toBeTruthy();
    expect(document.body.textContent).not.toContain('LISTA_NEGRA');
    const espia = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fireEvent.click(screen.getByLabelText('Hoy'));
    await waitFor(() =>
      expect(
        espia.mock.calls.some(([p]) => (p as Request).url.includes('/mi/historial?periodo=hoy')),
      ).toBe(true),
    );
  });

  it('notificaciones: el rechazo con su motivo y el ingreso, cada uno con su fecha', async () => {
    await montar(PANTALLAS[6]!);
    const lista = screen.getByRole('list', { name: 'Avisos de mis visitas' });
    expect(
      within(lista).getByText('Portería rechazó la visita de Carla Ruiz: No coincide la foto'),
    ).toBeTruthy();
    expect(within(lista).getByText('Pedro Gil ingresó al conjunto')).toBeTruthy();
    expect(within(lista).getAllByText(/^\d\d-\d\d-\d{4} \d\d:\d\d$/)).toHaveLength(2);
  });

  it('perfil: documento legible, fecha DD-MM-YYYY, teléfono de portería y los códigos de las plazas libres', async () => {
    await montar(PANTALLAS[7]!);
    expect(screen.getByText('Cédula de ciudadanía 10203040')).toBeTruthy();
    expect(screen.getByText('17-05-1990')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Llamar a portería' }).getAttribute('href')).toBe(
      'tel:6011234567',
    );
    expect(screen.getByText(/Ocupantes: 2/)).toBeTruthy();
    expect(screen.getByText('Código: ABCD-EFGH')).toBeTruthy();
    expect(screen.getByText(/Casa 42 · Manzana B · Titular/)).toBeTruthy();
  });

  it('visitas: quien no puede autorizar ve el botón deshabilitado y el porqué', async () => {
    vi.stubGlobal(
      'fetch',
      servidorFalso(() => ({})),
    );
    const espia = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    espia.mockImplementation(async (entrada: string | Request) => {
      const url = typeof entrada === 'string' ? entrada : entrada.url;
      if (url.endsWith('/mi/vivienda')) {
        return new Response(
          JSON.stringify({
            vivienda: {
              identificador: '42',
              agrupacion: null,
              etiquetaVivienda: 'Casa',
              etiquetaAgrupacion: 'Manzana',
              direccion: null,
              copropiedadNombre: 'Mira',
              estadoAdministrativo: 'al_dia',
              activa: false,
              id: 'x',
            },
            vinculo: { residenteId: 'r', esTitular: true, nivelAcceso: null },
            puedeAutorizar: false,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    render(<Envoltura>{PANTALLAS[3]!.montar()}</Envoltura>);
    await waitFor(() => expect(screen.getByText(/vivienda está inactiva/)).toBeTruthy());
    expect(
      (screen.getByRole('button', { name: 'Nuevo visitante' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

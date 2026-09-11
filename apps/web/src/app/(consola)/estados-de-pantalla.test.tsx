import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectorioDeViviendas } from './viviendas/directorio';
import { PantallaDeVehiculos } from './vehiculos/pantalla';
import { PantallaDeVisitantes } from './visitantes/pantalla';
import { PantallaDeZonas } from './zonas/pantalla';
import { PantallaDeDispositivos } from './dispositivos/pantalla';
import { PantallaDeEventos } from './eventos/pantalla';
import { PantallaDeInformes } from './informes/pantalla';

/**
 * **Los cinco estados de §6, en las SIETE pantallas.**
 *
 * El contrato los exige «en toda vista» y hasta aquí eso era una afirmación del
 * informe, no un hecho comprobado: cada pantalla llama a `estadoSegunCodigo`,
 * pero nadie había visto a ninguna hacerlo. Esta suite lo ejerce pantalla por
 * pantalla y código por código.
 *
 * El que más importa es el **404**. Un recurso de otra copropiedad responde 404
 * a propósito —un 403 confirmaría que el identificador existe— y la consola
 * tiene que decir «no encontrado». Si alguna pantalla lo tradujera a «sin
 * permiso», desharía por texto lo que el backend oculta por código de estado, y
 * eso es una fuga de información, no un detalle de redacción.
 */
const COP = '10000000-0000-4000-8000-000000000001';

const conCodigo =
  (estado: number): (() => Promise<Response>) =>
  async () =>
    new Response(JSON.stringify({ estado, mensaje: 'no' }), {
      status: estado,
      headers: { 'content-type': 'application/json' },
    });

/** La API no responde: ni siquiera hay respuesta que interpretar. */
const sinRed = (): (() => Promise<Response>) => async () => {
  throw new TypeError('Failed to fetch');
};

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
};

/**
 * Las siete, con el nombre con el que se las nombra en el informe. `informes`
 * no consulta al abrirse —es una consulta cara y se pide con un botón—, así
 * que su caso lleva la pulsación.
 */
const PANTALLAS: readonly {
  readonly nombre: string;
  readonly montar: () => JSX.Element;
  readonly pedir?: boolean;
}[] = [
  { nombre: 'viviendas', montar: () => <DirectorioDeViviendas copropiedadId={COP} /> },
  { nombre: 'vehículos', montar: () => <PantallaDeVehiculos copropiedadId={COP} /> },
  { nombre: 'visitantes', montar: () => <PantallaDeVisitantes copropiedadId={COP} /> },
  { nombre: 'zonas comunes', montar: () => <PantallaDeZonas copropiedadId={COP} /> },
  { nombre: 'dispositivos', montar: () => <PantallaDeDispositivos copropiedadId={COP} /> },
  { nombre: 'eventos', montar: () => <PantallaDeEventos copropiedadId={COP} /> },
  { nombre: 'informes', montar: () => <PantallaDeInformes copropiedadId={COP} />, pedir: true },
];

const montarYPedir = async (pantalla: (typeof PANTALLAS)[number]): Promise<void> => {
  render(<Envoltura>{pantalla.montar()}</Envoltura>);
  if (pantalla.pedir === true) {
    fireEvent.click(screen.getByRole('button', { name: /generar informe/i }));
  }
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(conCodigo(200)));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('403 · sin permiso', () => {
  for (const pantalla of PANTALLAS) {
    it(`${pantalla.nombre} lo dice sin fingir que no hay datos`, async () => {
      vi.stubGlobal('fetch', vi.fn(conCodigo(403)));
      await montarYPedir(pantalla);
      await waitFor(() => expect(screen.getByText('Sin permiso')).toBeDefined());
    });
  }
});

describe('404 · no encontrado, que es como llega un recurso de otra copropiedad', () => {
  for (const pantalla of PANTALLAS) {
    it(`${pantalla.nombre} NO lo traduce a «sin permiso»`, async () => {
      vi.stubGlobal('fetch', vi.fn(conCodigo(404)));
      await montarYPedir(pantalla);
      await waitFor(() => expect(screen.getByText('No encontrado')).toBeDefined());
      // La mitad que importa: decir «no es de tu copropiedad» confirmaría que
      // el identificador existe y desharía el aislamiento del backend.
      expect(screen.queryByText('Sin permiso')).toBeNull();
    });
  }
});

describe('503 · sin conexión, distinto de un error de datos', () => {
  for (const pantalla of PANTALLAS) {
    it(`${pantalla.nombre} distingue «la API no responde» de «algo salió mal»`, async () => {
      vi.stubGlobal('fetch', vi.fn(conCodigo(503)));
      await montarYPedir(pantalla);
      await waitFor(() => expect(screen.getByText('Sin conexión con el servidor')).toBeDefined());
    });
  }
});

describe('sin red · ni siquiera hay respuesta que interpretar', () => {
  for (const pantalla of PANTALLAS) {
    it(`${pantalla.nombre} cae en «sin conexión», no en un error genérico`, async () => {
      vi.stubGlobal('fetch', vi.fn(sinRed()));
      await montarYPedir(pantalla);
      await waitFor(() => expect(screen.getByText('Sin conexión con el servidor')).toBeDefined());
    });
  }
});

describe('500 · error de verdad, con opción de reintentar', () => {
  for (const pantalla of PANTALLAS) {
    it(`${pantalla.nombre} ofrece reintentar en vez de dejar la vista en blanco`, async () => {
      vi.stubGlobal('fetch', vi.fn(conCodigo(500)));
      await montarYPedir(pantalla);
      await waitFor(() => expect(screen.getByText('No se pudo cargar')).toBeDefined());
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeDefined();
    });
  }
});

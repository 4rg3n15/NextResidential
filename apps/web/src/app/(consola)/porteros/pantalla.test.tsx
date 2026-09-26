import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HechoDeBitacora, Portero, TurnoDePorteria } from '@ncr/contracts';
import { PantallaDePorteros } from './pantalla';

const COP = '10000000-0000-4000-8000-000000000001';
const hoy = new Date();
const dia = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

const TURNO: TurnoDePorteria = {
  id: '50000000-0000-4000-8000-000000000001',
  porteroId: '60000000-0000-4000-8000-000000000001',
  porteria: 'Norte',
  dia,
  horaInicio: '22:00',
  horaFin: '06:00',
  inicio: hoy.toISOString(),
  fin: new Date(hoy.getTime() + 8 * 3_600_000).toISOString(),
  cruzaMedianoche: true,
  tipo: 'extra',
  motivo: 'Cubre una incapacidad',
};

const PORTEROS: Portero[] = [
  {
    usuarioId: TURNO.porteroId,
    usuario: 'porteria.norte',
    nombre: 'Ana Garita',
    telefono: null,
    correoContacto: null,
    porteria: 'Norte',
    sectores: ['Torre 1'],
    debeCambiarContrasena: false,
    turnoVigente: TURNO,
    sesionAbierta: {
      estado: 'patrullaje',
      iniciadaEn: hoy.toISOString(),
      patrullajeDesde: hoy.toISOString(),
      origen: '203.0.113.7',
    },
  },
  {
    usuarioId: '60000000-0000-4000-8000-000000000002',
    usuario: 'relevo',
    nombre: 'Luis Relevo',
    telefono: null,
    correoContacto: null,
    porteria: 'Sur',
    sectores: [],
    debeCambiarContrasena: true,
    turnoVigente: null,
    sesionAbierta: null,
  },
];

const HECHOS: HechoDeBitacora[] = [
  {
    id: '70000000-0000-4000-8000-000000000001',
    tipo: 'fin_de_patrullaje',
    ocurridoEn: hoy.toISOString(),
    usuarioId: TURNO.porteroId,
    nombreUsuario: 'Ana Garita',
    actorId: TURNO.porteroId,
    nombreActor: 'Ana Garita',
    turnoId: TURNO.id,
    duracionSegundos: 900,
    origenIp: '10.0.0.5',
    origenDeclarado: '203.0.113.7',
    agente: 'navegador',
    detalle: null,
  },
];

const json = (cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (peticion: Request) => {
      const url = peticion.url;
      if (url.includes('/porteros')) return json({ porteros: PORTEROS });
      if (url.includes('/turnos')) return json({ turnos: [TURNO] });
      if (url.includes('/porteria/bitacora')) return json({ hechos: HECHOS });
      return json({});
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
  >
    {children}
  </QueryClientProvider>
);

describe('panel de supervisión de portería (B4)', () => {
  it('dice quién está de turno y quién patrulla, y quién tiene el cambio pendiente', async () => {
    render(<PantallaDePorteros copropiedadId={COP} />, { wrapper: Envoltura });
    await waitFor(() => expect(screen.getByText('1 de 2 de turno ahora')).toBeTruthy());
    const tabla = screen.getByRole('table', { name: /Porteros de la copropiedad/ });
    expect(within(tabla).getByText(/De turno hasta/)).toBeTruthy();
    expect(within(tabla).getByText(/Patrullando desde/)).toBeTruthy();
    expect(within(tabla).getByText('Cambio de contraseña pendiente')).toBeTruthy();
  });

  it('el calendario pinta el turno extra que cruza la medianoche', async () => {
    render(<PantallaDePorteros copropiedadId={COP} />, { wrapper: Envoltura });
    await waitFor(() =>
      expect(screen.getAllByText(/22:00–06:00 \(día siguiente\)/).length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText('Extra').length).toBeGreaterThan(0);
  });

  it('la bitácora enseña el patrullaje con su duración y el origen declarado', async () => {
    render(<PantallaDePorteros copropiedadId={COP} />, { wrapper: Envoltura });
    await waitFor(() => expect(screen.getByText('Vuelve de patrullar')).toBeTruthy());
    expect(screen.getByText('15 min')).toBeTruthy();
    expect(screen.getAllByText('203.0.113.7').length).toBeGreaterThan(0);
  });
});

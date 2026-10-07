import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { fechaYHora } from '@/lib/fechas';
import { AvisoDeRegistroSuspendido } from './registro-de-residentes';
import { TopeDePlazasPorOmision } from './tope-de-plazas-por-omision';

/**
 * RONDA 15-W · CONFIGURACIÓN DEL SUPERADMINISTRADOR: «CREAR CUENTA» Y PLAZAS.
 *
 * Dos afirmaciones que la pantalla podría desmentir en silencio: que el aviso
 * de registro suspendido aparece SÓLO cuando la API dice `suspendido: true`
 * —un aviso permanente se deja de leer— y que reanudar exige un motivo que
 * viaja normalizado; y que el tope por omisión envía `{ tope, motivo }` y
 * explica que bajarlo no quita plazas. El doble de `fetch` lee los cuerpos.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const REGISTRO = `/api/ncr/copropiedades/${COP}/residentes/registro`;
const REANUDACION = `${REGISTRO}/reanudacion`;
const TOPE = `/api/ncr/copropiedades/${COP}/tope-de-plazas`;
const HASTA = '2026-10-06T15:30:00.000Z';

let estado: { suspendido: boolean; hasta: string | null; fallosRecientes: number };
let tope: number;
let respuestaDeReanudar: () => { estado: number; cuerpo: unknown };
let escrituras: { metodo: string; ruta: string; cuerpo: unknown }[];

const json = (cuerpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  estado = { suspendido: false, hasta: null, fallosRecientes: 0 };
  tope = 4;
  escrituras = [];
  respuestaDeReanudar = () => {
    estado = { suspendido: false, hasta: null, fallosRecientes: 0 };
    return { estado: 200, cuerpo: { reanudado: true } };
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (p: Request) => {
      const ruta = new URL(p.url).pathname;
      if (p.method !== 'GET') {
        const cuerpo: unknown = await p.json();
        escrituras.push({ metodo: p.method, ruta, cuerpo });
        if (ruta === REANUDACION) {
          const r = respuestaDeReanudar();
          return json(r.cuerpo, r.estado);
        }
        if (ruta === TOPE) {
          tope = (cuerpo as { tope: number }).tope;
          return json({ tope });
        }
      }
      if (ruta === REGISTRO) return json(estado);
      if (ruta === TOPE) return json({ tope });
      return json({ estado: 404 }, 404);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const montar = (hijo: ReactNode): void => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {hijo}
    </QueryClientProvider>,
  );
};

const lecturasDelRegistro = (): number =>
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([p]) => new URL((p as Request).url).pathname === REGISTRO,
  ).length;

describe('15-W · «Registro suspendido por intentos»', () => {
  it('sin suspensión ni fallos no pinta nada', async () => {
    montar(<AvisoDeRegistroSuspendido copropiedadId={COP} />);
    await waitFor(() => expect(lecturasDelRegistro()).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByText(/Consultando/)).toBeNull());
    expect(screen.queryByText(/Registro suspendido por intentos/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reanudar' })).toBeNull();
  });

  it('con fallos y sin suspensión, una línea discreta y ningún botón', async () => {
    estado = { suspendido: false, hasta: null, fallosRecientes: 3 };
    montar(<AvisoDeRegistroSuspendido copropiedadId={COP} />);
    expect(await screen.findByText(/3 códigos de plaza incorrectos/)).toBeTruthy();
    expect(screen.queryByText(/Registro suspendido por intentos/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reanudar' })).toBeNull();
  });

  it('suspendido: dice hasta cuándo, que reanudar queda auditado, y exige motivo', async () => {
    estado = { suspendido: true, hasta: HASTA, fallosRecientes: 30 };
    montar(<AvisoDeRegistroSuspendido copropiedadId={COP} />);
    const aviso = await screen.findByRole('region', { name: 'Registro suspendido por intentos' });
    expect(aviso.textContent).toContain(fechaYHora(HASTA));
    expect(aviso.textContent).toMatch(/auditoría/);

    fireEvent.click(within(aviso).getByRole('button', { name: 'Reanudar' }));
    const dialogo = await screen.findByRole('dialog', { name: /Reanudar «Crear cuenta»/ });
    const confirmar = within(dialogo).getByRole('button', { name: 'Reanudar ahora' });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), { target: { value: 'ok' } });
    expect((confirmar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirmar);
    expect(escrituras).toHaveLength(0);

    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), {
      target: { value: ' El   residente ya tiene su código ' },
    });
    expect((confirmar as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirmar);
    await waitFor(() => expect(escrituras).toHaveLength(1));
    expect(escrituras[0]).toEqual({
      metodo: 'POST',
      ruta: REANUDACION,
      cuerpo: { motivo: 'El residente ya tiene su código' },
    });
    // Vuelve a preguntar, y la API ya no dice «suspendido»: el aviso se va.
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Registro suspendido por intentos' })).toBeNull(),
    );
    expect(await screen.findByText(/«Crear cuenta» se reanudó/)).toBeTruthy();
  });

  it('el 409 «El registro no está suspendido» se lee en el diálogo', async () => {
    estado = { suspendido: true, hasta: HASTA, fallosRecientes: 30 };
    respuestaDeReanudar = () => ({
      estado: 409,
      cuerpo: {
        estado: 409,
        correlacion: 'x',
        mensaje: { message: 'El registro no está suspendido', statusCode: 409 },
      },
    });
    montar(<AvisoDeRegistroSuspendido copropiedadId={COP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reanudar' }));
    const dialogo = await screen.findByRole('dialog', { name: /Reanudar «Crear cuenta»/ });
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), {
      target: { value: 'Prueba con el comité' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Reanudar ahora' }));
    expect((await within(dialogo).findByRole('alert')).textContent).toBe(
      'El registro no está suspendido',
    );
  });
});

describe('15-W · plazas por vivienda de la copropiedad (contando al titular)', () => {
  it('muestra el tope y envía { tope, motivo } al cambiarlo', async () => {
    montar(<TopeDePlazasPorOmision copropiedadId={COP} />);
    expect(await screen.findByText('4 por vivienda')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar tope' }));
    const dialogo = await screen.findByRole('dialog', { name: /Plazas por vivienda/ });
    expect(dialogo.textContent).toMatch(/nunca quita plazas/);
    const campo = within(dialogo).getByLabelText(/Plazas por vivienda \(contando al titular\)/);
    expect((campo as HTMLInputElement).value).toBe('4');
    const guardar = within(dialogo).getByRole('button', { name: 'Guardar' });
    fireEvent.change(campo, { target: { value: '3' } });
    expect((guardar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), {
      target: { value: 'Acuerdo de la asamblea' },
    });
    fireEvent.click(guardar);
    await waitFor(() => expect(escrituras).toHaveLength(1));
    expect(escrituras[0]).toEqual({
      metodo: 'PUT',
      ruta: TOPE,
      cuerpo: { tope: 3, motivo: 'Acuerdo de la asamblea' },
    });
    expect(await screen.findByText('3 por vivienda')).toBeTruthy();
  });

  it('fuera de 1 a 20 no se envía', async () => {
    montar(<TopeDePlazasPorOmision copropiedadId={COP} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Cambiar tope' }));
    const dialogo = await screen.findByRole('dialog', { name: /Plazas por vivienda/ });
    fireEvent.change(within(dialogo).getByLabelText(/Motivo/), {
      target: { value: 'Prueba de límites' },
    });
    const guardar = within(dialogo).getByRole('button', { name: 'Guardar' });
    for (const malo of ['0', '21', '']) {
      fireEvent.change(within(dialogo).getByLabelText(/contando al titular/), {
        target: { value: malo },
      });
      expect((guardar as HTMLButtonElement).disabled, malo).toBe(true);
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormularioDeConfiguracion } from './formulario';
import { rechazosPorCampo } from '@/lib/api/cliente';

/**
 * BLOQUE 7 · lo que este formulario AFIRMA y podría desmentir en silencio.
 *
 * Dos cosas se comprueban aquí y no en la API: que la consola **obedece** la
 * lista `editables` que la API declara —en vez de reproducir su propia tabla de
 * permisos, que se separaría— y que un 422 coloca cada motivo debajo de SU
 * campo. Lo segundo depende de leer el cuerpo en el sitio correcto, y el sitio
 * correcto no era el evidente: el filtro global de la API envuelve todo error
 * en `{ estado, correlacion, mensaje }`.
 */
const COP = '10000000-0000-4000-8000-000000000001';

const CONFIGURACION = {
  nombre: 'Villas del Bosque',
  zonaHoraria: 'America/Bogota',
  umbralConfianzaPlaca: 0.85,
  politicaContingenciaEdge: 'denegar',
  umbralLatidoMinutos: 5,
  nit: '900123456',
  estado: 'activa',
  plazoConsentimientoHoras: 24,
  margenCacheReglasHoras: 24,
  versionReglasActual: 3,
  editables: ['nombre', 'zonaHoraria', 'umbralLatidoMinutos'],
};

const json = (cuerpo: unknown, estado = 200): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
};

const montar = (): void => {
  render(
    <Envoltura>
      <FormularioDeConfiguracion copropiedadId={COP} />
    </Envoltura>,
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la consola OBEDECE la lista de editables de la API', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(CONFIGURACION)),
    );
  });

  it('deshabilita lo que este rol no puede cambiar', async () => {
    montar();
    await waitFor(() => expect(screen.getByLabelText(/nombre de la copropiedad/i)).toBeDefined());
    expect(screen.getByLabelText(/nombre de la copropiedad/i)).not.toHaveProperty('disabled', true);
    // No está en `editables`: la API dice que este rol no lo toca.
    expect(screen.getByLabelText(/umbral de confianza de placa/i)).toHaveProperty('disabled', true);
  });

  it('cuando lo deshabilita, DICE por qué en vez de esconderlo', async () => {
    // Ocultar el ajuste haría que pareciera que no existe, y acabaría pedido
    // otra vez. La razón visible cierra la conversación.
    montar();
    await waitFor(() =>
      expect(screen.getByText(/exclusivo del superadministrador/i)).toBeDefined(),
    );
  });

  it('con la lista vacía no ofrece guardar, y lo explica', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ ...CONFIGURACION, editables: [] })),
    );
    montar();
    await waitFor(() => expect(screen.getByText(/no la edita/i)).toBeDefined());
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toHaveProperty(
      'disabled',
      true,
    );
  });
});

describe('un 422 pone cada motivo debajo de SU campo', () => {
  it('lee los rechazos donde el filtro global de la API los deja', () => {
    // La forma real de producción. Buscarlos en el nivel superior es el error
    // fácil, y era la forma que la suite de la API devolvía antes de registrar
    // el mismo filtro que `main.ts`.
    expect(
      rechazosPorCampo({
        estado: 422,
        correlacion: 'x',
        mensaje: { codigo: 422, rechazos: [{ clave: 'nombre', motivo: 'demasiado corto' }] },
      }),
    ).toEqual({ nombre: 'demasiado corto' });
  });

  it('un cuerpo sin rechazos no inventa ninguno', () => {
    expect(rechazosPorCampo({ estado: 500, mensaje: 'Error interno' })).toBeUndefined();
    expect(rechazosPorCampo(null)).toBeUndefined();
  });

  it('el motivo aparece junto al campo rechazado', async () => {
    /**
     * El cliente llama a `fetch` con un `Request`, no con `(url, opciones)`:
     * así lo configura `lib/api/cliente.ts`. Leer el método del segundo
     * argumento devolvería siempre `undefined` y el doble contestaría 200 a
     * todo, incluido el PATCH — la prueba pasaría sin haber ejercido nada.
     */
    const peticiones = vi.fn(async (peticion: Request) => {
      if (peticion.method === 'PATCH') {
        return json(
          {
            estado: 422,
            correlacion: 'x',
            mensaje: {
              codigo: 422,
              rechazos: [
                { clave: 'zonaHoraria', motivo: 'no es una zona horaria de la base de datos IANA' },
              ],
            },
          },
          422,
        );
      }
      return json(CONFIGURACION);
    });
    vi.stubGlobal('fetch', vi.fn(peticiones));

    montar();
    await waitFor(() => expect(screen.getByLabelText(/zona horaria/i)).toBeDefined());
    fireEvent.change(screen.getByLabelText(/zona horaria/i), {
      target: { value: 'Marte/Olympus' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('no es una zona horaria'),
    );
  });
});

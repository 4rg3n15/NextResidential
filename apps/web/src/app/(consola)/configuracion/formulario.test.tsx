import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
 *
 * Y una tercera, de la ETAPA 15-E: que los dos umbrales técnicos **no viajan
 * en el PATCH**. La API los retiró de su DTO (15-B, B.5) y `forbidNonWhitelisted`
 * rechaza con 400 cualquier cuerpo que los traiga; mientras la consola los
 * siguió enviando, TODO guardado fallaba y ninguna prueba lo decía, porque el
 * doble de `fetch` contestaba 200 sin mirar el cuerpo. Aquí se lee el cuerpo.
 */
const COP = '10000000-0000-4000-8000-000000000001';

const CONFIGURACION = {
  nombre: 'Villas del Bosque',
  direccion: 'Kilómetro 4 vía La Calera',
  tipo: 'casas',
  etiquetaVivienda: 'Casa',
  etiquetaAgrupacion: 'Manzana',
  zonaHoraria: 'America/Bogota',
  // Lo que la API devuelve de verdad: la FRACCIÓN que guarda la columna
  // (`numeric(4,3)`). La pantalla tiene que enseñarla como 80, no como 0,800.
  umbralConfianzaPlaca: 0.8,
  politicaContingenciaEdge: 'denegar',
  umbralLatidoMinutos: 5,
  nit: '900123456',
  estado: 'activa',
  plazoConsentimientoHoras: 24,
  margenCacheReglasHoras: 24,
  versionReglasActual: 3,
  editables: ['nombre', 'zonaHoraria'],
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
    expect(screen.getByLabelText(/contingencia del edge/i)).toHaveProperty('disabled', true);
  });

  it('cuando lo deshabilita, DICE por qué en vez de esconderlo', async () => {
    // Ocultar el ajuste haría que pareciera que no existe, y acabaría pedido
    // otra vez. La razón visible cierra la conversación.
    montar();
    await waitFor(() =>
      expect(screen.getByText(/valor conservador que impone el contrato/i)).toBeDefined(),
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

describe('los dos umbrales técnicos se VEN y no se editan (15-B, B.5)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(CONFIGURACION)),
    );
  });

  it('muestra el umbral de confianza en la escala documentada, no como fracción', async () => {
    montar();
    const grupo = await screen.findByRole('group', { name: /umbral de confianza de placa/i });
    // 0,800 en la columna es 80 en `confidenceLevel` del evento ANPR (0–100),
    // que es la cifra que se puede contrastar con la hoja del fabricante.
    expect(grupo.textContent).toContain('80 de 100');
    expect(grupo.textContent).toContain('confidenceLevel');
    expect(grupo.textContent).not.toContain('0.800');
  });

  it('muestra el margen de latido con su unidad', async () => {
    montar();
    const grupo = await screen.findByRole('group', { name: /margen de latido/i });
    expect(grupo.textContent).toContain('5 minutos');
  });

  it('no hay campo numérico que un rol con más permiso pudiera abrir', async () => {
    // Un `<input disabled>` diría «pide el permiso»; y no existe tal permiso.
    montar();
    await screen.findByRole('group', { name: /umbral de confianza de placa/i });
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('explica que es una restricción de base, sin atribuirlo a ningún rol', async () => {
    montar();
    const umbral = await screen.findByRole('group', { name: /umbral de confianza de placa/i });
    const latido = await screen.findByRole('group', { name: /margen de latido/i });
    for (const grupo of [umbral, latido]) {
      expect(grupo.textContent).toMatch(/no es un ajuste de la copropiedad/i);
      expect(grupo.textContent).toMatch(/migración 0032/i);
      expect(grupo.textContent).toMatch(/exige una migración/i);
    }
    // La ayuda anterior lo afirmaba, y era falso: nadie lo edita.
    expect(screen.queryByText(/exclusivo del superadministrador/i)).toBeNull();
  });

  it('el PATCH que envía la consola NO lleva los umbrales', async () => {
    /**
     * Se captura el `Request` y se LEE su cuerpo. Contestar 200 sin mirarlo es
     * lo que dejó pasar el defecto: la API real respondía 400 a cada guardado y
     * el doble seguía diciendo que todo iba bien.
     */
    const capturadas: Request[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (peticion: Request) => {
        if (peticion.method === 'PATCH') capturadas.push(peticion);
        return json(CONFIGURACION);
      }),
    );

    montar();
    await waitFor(() => expect(screen.getByLabelText(/nombre de la copropiedad/i)).toBeDefined());
    fireEvent.change(screen.getByLabelText(/nombre de la copropiedad/i), {
      target: { value: 'Villas del Bosque II' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(capturadas.length).toBe(1));
    const [peticion] = capturadas;
    if (peticion === undefined) throw new Error('no se capturó el PATCH');
    const cuerpo: unknown = await peticion.json();

    expect(cuerpo).toMatchObject({ nombre: 'Villas del Bosque II', zonaHoraria: 'America/Bogota' });
    expect(cuerpo).not.toHaveProperty('umbralConfianzaPlaca');
    expect(cuerpo).not.toHaveProperty('umbralLatidoMinutos');

    /**
     * 15-E · y la regla general, no sólo los dos nombres que ya fallaron: cada
     * clave que la consola manda tiene que existir en el esquema del cuerpo
     * que la API publica (`CambiosDeConfiguracionDto` del contrato versionado).
     * `forbidNonWhitelisted` convierte cualquier clave de más en un 400, así
     * que ésta es la prueba que se pone roja ANTES de que un superadministrador
     * vuelva a no poder guardar nada.
     */
    const contrato = JSON.parse(
      readFileSync(resolve(process.cwd(), '../../packages/contracts/openapi.json'), 'utf8'),
    ) as {
      components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
    };
    const admitidas = new Set(
      Object.keys(contrato.components.schemas['CambiosDeConfiguracionDto']?.properties ?? {}),
    );
    expect(admitidas.size).toBeGreaterThan(0);
    const fueraDelContrato = Object.keys(cuerpo as Record<string, unknown>).filter(
      (clave) => !admitidas.has(clave),
    );
    expect(
      fueraDelContrato,
      `la consola manda claves que la API rechaza con 400: ${fueraDelContrato.join(', ')}`,
    ).toEqual([]);
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

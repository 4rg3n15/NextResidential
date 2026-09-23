import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectorioDeViviendas } from './directorio';
import { ConfiguracionInicial } from '@/componentes/configuracion-inicial';

/**
 * El alta de viviendas por generación, desde la consola.
 *
 * Lo que se comprueba aquí **no es que el asistente pinte campos**: es que no
 * se pueda crear nada sin haber visto antes qué se va a crear. Generar 300
 * viviendas a ciegas y descubrir después que el patrón estaba mal es caro de
 * deshacer —la baja es una por una y cada una exige motivo (RN-19)—, así que
 * la vista previa no es una comodidad, es la barrera.
 */

const COP = '10000000-0000-4000-8000-000000000001';

const respuesta = (cuerpo: unknown, estado = 200): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json' },
  });

const CONFIGURACION = {
  nombre: 'Torres del Parque',
  direccion: 'Carrera 5 número 26-30',
  tipo: 'apartamentos',
  etiquetaVivienda: 'Apartamento',
  etiquetaAgrupacion: 'Torre',
  zonaHoraria: 'America/Bogota',
  umbralConfianzaPlaca: 0.85,
  politicaContingenciaEdge: 'denegar',
  umbralLatidoMinutos: 5,
  nit: '900123456',
  estado: 'activa',
  plazoConsentimientoHoras: 24,
  margenCacheReglasHoras: 24,
  versionReglasActual: 1,
  editables: ['nombre', 'direccion', 'tipo', 'etiquetaVivienda', 'etiquetaAgrupacion'],
};

const VISTA_PREVIA = {
  total: 39,
  grupos: [
    {
      agrupacion: 'A',
      cantidad: 15,
      primeras: ['101', '102'],
      ultimas: ['502', '503'],
      porExcepcion: false,
    },
    {
      agrupacion: 'B',
      cantidad: 15,
      primeras: ['101', '102'],
      ultimas: ['502', '503'],
      porExcepcion: false,
    },
    {
      agrupacion: 'C',
      cantidad: 9,
      primeras: ['101', '102'],
      ultimas: ['302', '303'],
      porExcepcion: true,
    },
  ],
  colisiones: [] as { agrupacion: string | null; identificador: string }[],
};

const servidorFalso = (
  vistaPrevia: unknown = VISTA_PREVIA,
  configuracion: unknown = CONFIGURACION,
): ReturnType<typeof vi.fn> =>
  vi.fn(async (entrada: string | Request) => {
    const url = typeof entrada === 'string' ? entrada : entrada.url;
    if (url.includes('/generacion/previsualizacion')) return respuesta(vistaPrevia);
    if (url.includes('/viviendas/generacion')) return respuesta({ creadas: 39 });
    if (url.includes('/configuracion')) return respuesta(configuracion);
    if (url.includes('/padron/viviendas')) {
      return respuesta({ totales: { activas: 0, inactivas: 0 }, viviendas: [] });
    }
    return respuesta({});
  });

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
};

const abrirAsistente = async (): Promise<void> => {
  render(
    <Envoltura>
      <DirectorioDeViviendas copropiedadId={COP} />
    </Envoltura>,
  );
  const abrir = await screen.findByRole('button', { name: /Generar padrón/ });
  fireEvent.click(abrir);
};

const botonDeEnvio = (): HTMLButtonElement => {
  const boton = screen
    .getByRole('dialog')
    .querySelector<HTMLButtonElement>('button[type="submit"]');
  if (boton === null) throw new Error('el diálogo no tiene botón de envío');
  return boton;
};

const escrituras = (): readonly string[] => {
  const espia = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  return (espia.mock.calls as readonly unknown[][])
    .map(([entrada]) => entrada)
    .filter((e): e is Request => e instanceof Request && e.method !== 'GET')
    .map((e) => new URL(e.url).pathname);
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('no se crea nada sin haber visto antes qué se crea', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', servidorFalso());
  });

  it('el primer envío PREVISUALIZA, y solo el segundo crea', async () => {
    await abrirAsistente();
    expect(botonDeEnvio().textContent).toMatch(/Ver qué se va a crear/);

    fireEvent.click(botonDeEnvio());
    await waitFor(() => expect(botonDeEnvio().textContent).toMatch(/Crear 39 viviendas/));

    // Hasta aquí, lo único que salió fue la previsualización.
    expect(escrituras()).toEqual([
      '/api/ncr/copropiedades/10000000-0000-4000-8000-000000000001/padron/viviendas/generacion/previsualizacion',
    ]);

    fireEvent.click(botonDeEnvio());
    await waitFor(() => expect(escrituras()).toHaveLength(2));
    expect(escrituras()[1]).toMatch(/\/padron\/viviendas\/generacion$/);
  });

  it('la vista previa enseña los extremos de cada grupo y marca la excepción', async () => {
    await abrirAsistente();
    fireEvent.click(botonDeEnvio());

    const vista = await screen.findByRole('region', { name: /Vista previa/ });
    expect(vista.textContent).toMatch(/Se van a crear 39 viviendas/);
    // Que la Torre C acabe en 303 y no en 503 es exactamente lo que detecta un
    // patrón mal puesto; por eso se enseñan los extremos y no las 39.
    expect(vista.textContent).toMatch(/Torre C/);
    expect(vista.textContent).toMatch(/302, 303/);
    expect(vista.textContent).toMatch(/excepción/);
  });

  it('tocar un campo después de previsualizar INVALIDA la vista previa', async () => {
    // La ventana que cierra: previsualizar 39, añadir una torre y confirmar
    // creyendo que siguen siendo 39. El servidor lo rechazaría por
    // `totalEsperado`, pero la consola no debe dejar pulsar un botón que
    // promete un número que ya no es cierto.
    await abrirAsistente();
    fireEvent.click(botonDeEnvio());
    await waitFor(() => expect(botonDeEnvio().textContent).toMatch(/Crear 39 viviendas/));

    const cuantas = screen.getByLabelText(/Cuántas apartamentos en total/i);
    fireEvent.change(cuantas, { target: { value: '40' } });

    expect(botonDeEnvio().textContent).toMatch(/Ver qué se va a crear/);
    expect(screen.queryByRole('region', { name: /Vista previa/ })).toBeNull();
  });
});

describe('la generación no sustituye nada', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      servidorFalso({
        ...VISTA_PREVIA,
        colisiones: [{ agrupacion: 'A', identificador: '101' }],
      }),
    );
  });

  it('una colisión bloquea la confirmación y la nombra', async () => {
    await abrirAsistente();
    fireEvent.click(botonDeEnvio());

    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toMatch(/ya existen/i);
    expect(aviso.textContent).toMatch(/Torre A · 101/);
    expect(botonDeEnvio().disabled).toBe(true);
  });
});

describe('las excepciones por torre se piden, no se adivinan', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', servidorFalso());
  });

  it('la casilla despliega el bloque y el enlace repite otro', async () => {
    await abrirAsistente();
    // Sin denominador no hay excepciones que pedir: no hay a qué hacerlas.
    expect(screen.queryByLabelText(/Hay torres con otra cantidad/i)).toBeNull();

    fireEvent.click(screen.getByLabelText(/El conjunto se divide en torres/i));
    fireEvent.click(screen.getByLabelText(/Hay torres con otra cantidad/i));
    expect(screen.getAllByLabelText(/^Cuántas apartamentos$/)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Incluir otra excepción/ }));
    expect(screen.getAllByLabelText(/^Cuántas apartamentos$/)).toHaveLength(2);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B.1 · LA PREGUNTA QUE FALTABA
 *
 * El asistente pedía torres, pisos y viviendas por piso, y **nunca** cuántas
 * viviendas hay. Quien administra un conjunto sabe que tiene 120 apartamentos;
 * que salgan de 4 × 6 × 5 es una cuenta que tenía que hacer él para poder
 * contestar. Y el denominador era obligatorio incluso donde no existe.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('B.1 · se pregunta CUÁNTAS viviendas, y el denominador es opcional', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', servidorFalso());
  });

  it('el denominador arranca APAGADO y la cantidad se pide como total', async () => {
    await abrirAsistente();
    expect(screen.getByLabelText(/Cuántas apartamentos en total/i)).toBeDefined();
    expect(screen.queryByLabelText(/^Cuántas torres$/i)).toBeNull();
  });

  it('al activarlo, la misma pregunta pasa a ser POR CADA UNO', async () => {
    await abrirAsistente();
    fireEvent.click(screen.getByLabelText(/El conjunto se divide en torres/i));
    expect(screen.getByLabelText(/^Cuántas torres$/i)).toBeDefined();
    expect(screen.getByLabelText(/Cuántas apartamentos por cada torre/i)).toBeDefined();
    expect(screen.queryByLabelText(/Cuántas apartamentos en total/i)).toBeNull();
  });

  it('el cuerpo que sale lleva cantidad, no pisos', async () => {
    await abrirAsistente();
    fireEvent.click(screen.getByLabelText(/El conjunto se divide en torres/i));
    fireEvent.change(screen.getByLabelText(/^Cuántas torres$/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Cuántas apartamentos por cada torre/i), {
      target: { value: '24' },
    });
    fireEvent.click(botonDeEnvio());

    await waitFor(() => expect(escrituras()).toHaveLength(1));
    const espia = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const peticion = (espia.mock.calls as readonly unknown[][])
      .map(([e]) => e)
      .find((e): e is Request => e instanceof Request && e.method !== 'GET');
    const cuerpo = (await peticion!.clone().json()) as Record<string, unknown>;
    expect(cuerpo['agrupaciones']).toBe(3);
    expect(cuerpo['cantidad']).toBe(24);
    expect(cuerpo).not.toHaveProperty('pisos');
    expect(cuerpo).not.toHaveProperty('total');
  });

  it('los pisos son una forma de NUMERAR, no de contar', async () => {
    await abrirAsistente();
    // En apartamentos viene marcada, que es lo que usan los edificios; y se
    // puede apagar, porque no todos numeran así.
    const porPiso = screen.getByLabelText(/Numerar por piso/i) as HTMLInputElement;
    expect(porPiso.checked).toBe(true);
    expect(screen.getByLabelText(/Cuántas apartamentos por piso/i)).toBeDefined();

    fireEvent.click(porPiso);
    expect(screen.queryByLabelText(/Cuántas apartamentos por piso/i)).toBeNull();
  });
});

describe('el diálogo de configuración inicial', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const montarDialogo = (configuracion: unknown, rol: 'administrador' | 'portero'): void => {
    vi.stubGlobal('fetch', servidorFalso(VISTA_PREVIA, configuracion));
    render(
      <Envoltura>
        <ConfiguracionInicial copropiedadId={COP} rol={rol} />
      </Envoltura>,
    );
  };

  it('aparece cuando el conjunto no ha dicho de qué tipo es', async () => {
    // Lo dispara un estado del SERVIDOR —`tipo` nulo—, no «es la primera
    // sesión» ni una marca del navegador (D-67, D-68).
    montarDialogo({ ...CONFIGURACION, tipo: null }, 'administrador');
    expect(await screen.findByRole('dialog')).toBeDefined();
    expect(screen.getByText(/Configure su copropiedad/)).toBeDefined();
  });

  it('NO aparece cuando ya está configurada', async () => {
    montarDialogo(CONFIGURACION, 'administrador');
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('elegir el tipo sugiere las palabras, y siguen siendo editables', async () => {
    montarDialogo({ ...CONFIGURACION, tipo: null }, 'administrador');
    await screen.findByRole('dialog');

    fireEvent.click(screen.getByLabelText(/Casas/));
    const etiqueta = screen.getByLabelText(/Cómo llama a una vivienda/) as HTMLInputElement;
    expect(etiqueta.value).toBe('Casa');

    fireEvent.change(etiqueta, { target: { value: 'Villa' } });
    expect((screen.getByLabelText(/Cómo llama a una vivienda/) as HTMLInputElement).value).toBe(
      'Villa',
    );
  });

  it('a quien no puede configurar no se le pregunta, y ni siquiera se consulta', () => {
    // La API le responde 404 a un portero; pedirlo para luego no pintar nada
    // sería una petición que solo sirve para llenar el registro de errores.
    montarDialogo({ ...CONFIGURACION, tipo: null }, 'portero');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

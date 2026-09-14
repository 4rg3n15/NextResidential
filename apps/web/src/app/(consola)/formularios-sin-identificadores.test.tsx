import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectorioDeViviendas } from './viviendas/directorio';
import { PantallaDeVehiculos } from './vehiculos/pantalla';
import { PantallaDeVisitantes } from './visitantes/pantalla';

/**
 * **Barrido de formularios — D-72 y D-73, y no ruta a ruta.**
 *
 * Dos defectos aparecieron juntos en la misma pantalla y son de clases
 * distintas, así que aquí hay dos controles:
 *
 *  1. **Ningún campo pide un identificador interno.** El formulario de
 *     autorización rotulaba «Persona que visita (identificador)» y respondía
 *     `personaId must be a UUID` a quien escribiera un nombre.
 *  2. **Ninguna restricción del dominio llega al servidor sin haberse señalado
 *     en el formulario.** La misma pantalla aceptó una vigencia que terminaba
 *     antes de empezar, y el error que mostró fue el del OTRO campo.
 *
 * **Por qué el primero se deriva del contrato y no de una lista.** El barrido
 * teclea basura en TODO campo de texto, elige la primera opción de cada
 * desplegable y resuelve cada buscador, envía, y comprueba contra
 * `openapi.json` que cada propiedad que la API declara `format: uuid` llegó
 * siendo un UUID de verdad. Si alguien vuelve a poner un campo libre donde va
 * un identificador, la basura tecleada viaja tal cual y esto se pone rojo: no
 * hay ninguna lista de campos prohibidos que mantener.
 *
 * El registro de pantallas sí es explícito, y por eso lo vigila
 * `todas las escrituras de la consola están clasificadas`: una pantalla nueva
 * que escriba y no aparezca aquí rompe la suite.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RAIZ = resolve(process.cwd(), '../..');
const CONSOLA = resolve(process.cwd(), 'src/app/(consola)');

interface Esquema {
  readonly $ref?: string;
  readonly format?: string;
  readonly properties?: Readonly<Record<string, Esquema>>;
}
interface Contrato {
  readonly paths: Readonly<
    Record<
      string,
      Readonly<
        Record<
          string,
          { readonly requestBody?: { content: Record<string, { schema: Esquema }> } } | undefined
        >
      >
    >
  >;
  readonly components: { readonly schemas: Readonly<Record<string, Esquema>> };
}

const contrato = JSON.parse(
  readFileSync(join(RAIZ, 'packages/contracts/openapi.json'), 'utf8'),
) as Contrato;

/** Traduce `/copropiedades/{id}/autorizaciones` a la ruta concreta que se pidió. */
const plantillaDe = (ruta: string): string | undefined =>
  Object.keys(contrato.paths).find((t) =>
    new RegExp(`^${t.replace(/\{[^}]+\}/g, '[^/]+')}$`).test(ruta),
  );

/** Propiedades del cuerpo que la API declara como UUID, según el contrato. */
const camposUuid = (metodo: string, ruta: string): readonly string[] => {
  const plantilla = plantillaDe(ruta);
  if (plantilla === undefined) return [];
  const operacion = contrato.paths[plantilla]?.[metodo.toLowerCase()];
  const esquema = operacion?.requestBody?.content['application/json']?.schema;
  const referencia = esquema?.$ref;
  const resuelto =
    referencia === undefined
      ? esquema
      : contrato.components.schemas[referencia.replace('#/components/schemas/', '')];
  return Object.entries(resuelto?.properties ?? {})
    .filter(([, v]) => v.format === 'uuid')
    .map(([k]) => k);
};

const respuesta = (cuerpo: unknown): Response =>
  new Response(JSON.stringify(cuerpo), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

const PERSONA = {
  id: '20000000-0000-4000-8000-0000000000aa',
  nombreCompleto: 'Ana Pérez',
  tipoDocumento: 'cedula',
  numeroDocumento: '12345678',
  esResidente: false,
  viviendaIdentificador: null,
};

const VIVIENDA = {
  id: '30000000-0000-4000-8000-0000000000bb',
  identificador: 'Casa 12',
  manzana: 'B',
  direccion: null,
  estado: 'activo',
  estadoAdministrativo: 'al_dia',
  residentes: 1,
  vehiculos: 0,
  autorizacionesVigentes: 0,
  desactivadaEn: null,
  motivoDesactivacion: null,
};

const servidorFalso = (): ReturnType<typeof vi.fn> =>
  vi.fn(async (entrada: string | Request) => {
    const url = typeof entrada === 'string' ? entrada : entrada.url;
    if (url.includes('/padron/personas')) return respuesta([PERSONA]);
    if (url.includes('/padron/viviendas')) {
      return respuesta({ totales: { activas: 1, inactivas: 0 }, viviendas: [VIVIENDA] });
    }
    if (url.includes('/padron/vehiculos')) return respuesta([]);
    if (url.includes('/autorizaciones')) return respuesta([]);
    return respuesta({ id: PERSONA.id, nombreCompleto: PERSONA.nombreCompleto, yaExistia: false });
  });

const Envoltura = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
  >
    {children}
  </QueryClientProvider>
);

const enHoras = (horas: number): string =>
  new Date(Date.now() + horas * 3_600_000).toISOString().slice(0, 16);

/**
 * Rellena el formulario **como lo haría alguien que no sabe nada del sistema**:
 * texto corriente en los campos de texto, la primera opción de cada
 * desplegable, y en cada buscador el primer resultado que ofrezca.
 *
 * Es deliberado que no distinga qué campo es cuál: en cuanto lo hiciera,
 * dejaría de detectar el campo nuevo que nadie añadió a la prueba.
 */
const escribir = (campo: HTMLElement, valor: string): void => {
  fireEvent.change(campo, { target: { value: valor } });
};

const rellenar = async (): Promise<void> => {
  const dialogo = screen.getByRole('dialog');

  for (const seleccion of Array.from(dialogo.querySelectorAll('select'))) {
    const opcion = Array.from(seleccion.options).find((o) => o.value !== '');
    if (opcion !== undefined) escribir(seleccion, opcion.value);
  }

  // Buscadores: se teclea y se elige el primer resultado. Un campo que exigiera
  // un identificador NO ofrece resultados, así que aquí no se resolvería.
  for (const buscador of Array.from(
    dialogo.querySelectorAll<HTMLInputElement>('input[role="combobox"]'),
  )) {
    fireEvent.focus(buscador);
    escribir(buscador, 'Ana');
    const opcion = await screen.findByRole('option', { name: /Ana Pérez/ });
    fireEvent.click(opcion);
  }

  const fechas = Array.from(
    dialogo.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'),
  );
  // El par se llena en orden: la vigencia invertida tiene su propia prueba.
  for (const [indice, campo] of fechas.entries()) {
    escribir(campo, enHoras(indice === 0 ? 1 : 24));
  }

  for (const campo of Array.from(dialogo.querySelectorAll<HTMLInputElement>('input'))) {
    const tipo = campo.getAttribute('type');
    if (tipo !== 'text' && tipo !== null) continue;
    if (campo.getAttribute('role') === 'combobox') continue;
    if (campo.value !== '') continue;
    escribir(campo, 'Texto que escribe una persona');
  }
};

interface PeticionObservada {
  readonly metodo: string;
  readonly ruta: string;
  readonly cuerpo: unknown;
}

/** El botón de envío DEL DIÁLOGO abierto, no el primero del documento. */
const botonDeEnvio = (): HTMLButtonElement => {
  const boton = screen
    .getByRole('dialog')
    .querySelector<HTMLButtonElement>('button[type="submit"]');
  if (boton === null) throw new Error('el diálogo no tiene botón de envío');
  return boton;
};

const escrituras = async (): Promise<readonly PeticionObservada[]> => {
  const espia = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const observadas: PeticionObservada[] = [];
  for (const [entrada] of espia.mock.calls as readonly unknown[][]) {
    if (!(entrada instanceof Request) || entrada.method === 'GET') continue;
    observadas.push({
      metodo: entrada.method,
      ruta: new URL(entrada.url).pathname.replace('/api/ncr', ''),
      cuerpo: await entrada.clone().json(),
    });
  }
  return observadas;
};

/** Espera a que el formulario haya enviado algo, y devuelve lo enviado. */
const escriturasTras = async (): Promise<readonly PeticionObservada[]> => {
  await waitFor(async () => expect((await escrituras()).length).toBeGreaterThan(0));
  return escrituras();
};

const PANTALLAS = [
  {
    nombre: 'viviendas',
    elemento: <DirectorioDeViviendas copropiedadId={COP} />,
    boton: /Nueva vivienda/,
  },
  {
    nombre: 'vehículos',
    elemento: <PantallaDeVehiculos copropiedadId={COP} />,
    boton: /Registrar vehículo/,
  },
  {
    nombre: 'visitantes',
    elemento: <PantallaDeVisitantes copropiedadId={COP} />,
    boton: /Nueva autorización/,
  },
] as const;

beforeEach(() => {
  vi.stubGlobal('fetch', servidorFalso());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ningún formulario pide un identificador interno (D-72)', () => {
  for (const pantalla of PANTALLAS) {
    it(`${pantalla.nombre}: la basura tecleada nunca llega a un campo UUID del contrato`, async () => {
      render(<Envoltura>{pantalla.elemento}</Envoltura>);

      const abrir = await screen.findAllByRole('button', { name: pantalla.boton });
      fireEvent.click(abrir[0]!);
      await rellenar();

      const enviar = botonDeEnvio();
      expect(
        enviar.disabled,
        'con todos los campos rellenados el formulario DEBE poder enviarse: si sigue bloqueado, algo pide un dato que nadie tiene a mano',
      ).toBe(false);
      fireEvent.click(enviar);

      const escrituras = await escriturasTras();
      expect(escrituras.length, 'el formulario no llegó a enviar nada').toBeGreaterThan(0);

      for (const escritura of escrituras) {
        const campos = camposUuid(escritura.metodo, escritura.ruta);
        for (const campo of campos) {
          const valor = (escritura.cuerpo as Record<string, unknown>)[campo];
          if (valor === undefined) continue;
          expect(
            typeof valor === 'string' && UUID.test(valor),
            `${escritura.ruta} · «${campo}» viajó como «${String(valor)}»: el contrato lo declara UUID, así que alguien lo está tecleando a mano`,
          ).toBe(true);
        }
      }
    });
  }
});

describe('las restricciones del dominio se señalan antes de enviarlas (D-73)', () => {
  it('una vigencia invertida no sale del navegador y se dice cuál es el problema', async () => {
    render(
      <Envoltura>
        <PantallaDeVisitantes copropiedadId={COP} />
      </Envoltura>,
    );
    fireEvent.click((await screen.findAllByRole('button', { name: /Nueva autorización/ }))[0]!);
    await rellenar();

    // Se invierte el par: «hasta» pasa a ser anterior a «desde», que es
    // exactamente lo que se aceptó el 13/09.
    const dialogo = screen.getByRole('dialog');
    const fechas = Array.from(
      dialogo.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'),
    );
    escribir(fechas[1]!, enHoras(-4));

    expect(screen.getByRole('alert').textContent).toMatch(/termina antes de empezar/);

    const enviar = botonDeEnvio();
    expect(enviar.disabled).toBe(true);

    fireEvent.click(enviar);
    expect((await escrituras()).filter((p) => p.ruta.endsWith('/autorizaciones'))).toHaveLength(0);
  });

  it('el patrón recurrente enseña sus días y su franja, y rechaza la que cruza la medianoche', async () => {
    render(
      <Envoltura>
        <PantallaDeVisitantes copropiedadId={COP} />
      </Envoltura>,
    );
    fireEvent.click((await screen.findAllByRole('button', { name: /Nueva autorización/ }))[0]!);

    // Antes de marcar la casilla, la etiqueta NO puede prometer unos días que
    // no se ven por ninguna parte: era la tercera mitad del defecto.
    expect(screen.queryByRole('group', { name: /Días de la semana/ })).toBeNull();
    expect(
      screen.getByRole('dialog').textContent ?? '',
      'el formulario anuncia unos «días marcados» que no se ven por ninguna parte',
    ).not.toMatch(/días marcados/i);

    fireEvent.click(screen.getByLabelText(/Autorización recurrente/));
    expect(screen.getByRole('group', { name: /Días de la semana/ })).toBeDefined();

    escribir(screen.getByLabelText(/Hasta la hora/), '02:00');
    await waitFor(() =>
      expect(screen.getAllByRole('alert').some((a) => /medianoche/.test(a.textContent ?? ''))).toBe(
        true,
      ),
    );
  });
});

/**
 * Guardia estructural, en el espíritu del barrido de D-71: la lista de arriba
 * es explícita, así que algo tiene que vigilar que no se quede corta. Se
 * enumeran los ficheros de la consola que ESCRIBEN y se exige que cada uno esté
 * clasificado — con formulario que este barrido recorre, o exento con motivo.
 */
const SIN_FORMULARIO: Readonly<Record<string, string>> = {
  'porteria/pantalla.tsx':
    'la apertura manual actúa sobre el evento que ya está en pantalla; solo se teclea el motivo (RN-08)',
  'guardia/pantalla.tsx':
    'las órdenes actúan sobre el elemento en atención; no se introduce ninguna identidad',
  'dispositivos/pantalla.tsx': 'botones por fila del inventario; no hay campos que rellenar',
  'viviendas/carga-de-padron.tsx':
    'la entrada es un archivo, y su validación por fila la hace el servidor con reporte por fila',
  'configuracion/formulario.tsx':
    'campos numéricos con min/max declarados que el navegador impide enviar fuera de rango, y 422 por campo',
};

const ficherosQueEscriben = (directorio: string): readonly string[] =>
  readdirSync(directorio).flatMap((entrada) => {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) return ficherosQueEscriben(ruta);
    if (!ruta.endsWith('.tsx') || ruta.endsWith('.test.tsx')) return [];
    return /cliente\.(POST|PATCH|PUT|DELETE)\(/.test(readFileSync(ruta, 'utf8'))
      ? [relative(CONSOLA, ruta)]
      : [];
  });

describe('cobertura del barrido', () => {
  it('todas las escrituras de la consola están clasificadas', () => {
    const conFormulario = new Set([
      'viviendas/directorio.tsx',
      'vehiculos/pantalla.tsx',
      'visitantes/pantalla.tsx',
    ]);
    const sinClasificar = ficherosQueEscriben(CONSOLA).filter(
      (f) => !conFormulario.has(f) && SIN_FORMULARIO[f] === undefined,
    );
    expect(
      sinClasificar,
      'una pantalla nueva escribe y nadie la recorrió: añádela al barrido o declara por qué no lleva formulario',
    ).toEqual([]);
  });
});

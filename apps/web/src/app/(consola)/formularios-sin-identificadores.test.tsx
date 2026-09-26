import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectorioDeViviendas } from './viviendas/directorio';
import { PantallaDeVehiculos } from './vehiculos/pantalla';
import { PantallaDeVisitantes } from './visitantes/pantalla';
import { PantallaDeDispositivos } from './dispositivos/pantalla';
import { PantallaDeZonas } from './zonas/pantalla';

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

/** Vocabulario del conjunto: sin él el directorio no ofrece generar padrón. */
const CONFIGURACION = {
  nombre: 'Urbanización Mira',
  direccion: 'Kilómetro 4 vía La Calera',
  tipo: 'casas',
  etiquetaVivienda: 'Casa',
  etiquetaAgrupacion: 'Manzana',
  zonaHoraria: 'America/Bogota',
  umbralConfianzaPlaca: 0.85,
  politicaContingenciaEdge: 'denegar',
  umbralLatidoMinutos: 5,
  nit: '900123456',
  estado: 'activa',
  plazoConsentimientoHoras: 24,
  margenCacheReglasHoras: 24,
  versionReglasActual: 1,
  editables: ['nombre'],
};

const VIVIENDA = {
  id: '30000000-0000-4000-8000-0000000000bb',
  identificador: '12',
  agrupacion: 'B',
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
    if (url.includes('/configuracion')) return respuesta(CONFIGURACION);
    if (url.includes('/padron/viviendas/generacion/previsualizacion')) {
      return respuesta({ total: 30, grupos: [], colisiones: [] });
    }
    if (url.includes('/padron/personas')) return respuesta([PERSONA]);
    if (url.includes('/padron/viviendas')) {
      return respuesta({ totales: { activas: 1, inactivas: 0 }, viviendas: [VIVIENDA] });
    }
    if (url.includes('/padron/vehiculos')) return respuesta([]);
    if (url.includes('/dispositivos/pendientes')) return respuesta({ dispositivos: [] });
    if (url.includes('/tablero/dispositivos')) return respuesta({ dispositivos: [] });
    if (url.includes('/equipos') && !url.includes('/prueba-de-conexion')) {
      return respuesta({ equipos: [] });
    }
    if (url.includes('/equipos/prueba-de-conexion')) {
      return respuesta({
        clase: 'alcanzado',
        detalle: 'El equipo responde',
        modelo: null,
        firmware: null,
        latenciaMs: 10,
        verificado: true,
      });
    }
    if (url.includes('/autorizaciones')) return respuesta([]);
    if (url.includes('/zonas')) return respuesta([]);
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

  /**
   * Texto corriente en todo campo de texto, **incluidos los de contraseña**.
   *
   * `password` faltaba, y el hueco se vio al añadir el alta de equipos: su
   * formulario pide la clave del aparato, el barrido no la rellenaba, el botón
   * de envío seguía deshabilitado y el control informaba «algo pide un dato que
   * nadie tiene a mano». Tenía razón en la forma y no en el fondo: el dato lo
   * tenía a mano, era el barrido el que no sabía escribirlo.
   *
   * ═══════════════════════════════════════════════════════════════════════════
   * Y POR QUÉ EL TEXTO NO LLEVA ESPACIOS · 15-C
   *
   * El valor anterior sí los llevaba, y la 15-C lo destapó: el alta de equipos
   * validó el usuario contra el juego de caracteres que el aparato admite, y
   * ahí **el espacio no entra**. El barrido tecleaba algo que ningún equipo
   * aceptaría y leía el rechazo como «pide un dato que nadie tiene a mano».
   *
   * El valor es genérico a propósito: letras y dígitos valen en TODOS los
   * campos de texto del sistema, así que el barrido sigue sin saber nada de
   * ninguna pantalla concreta — que es lo que lo hace un control y no una
   * prueba de una pantalla.
   */
  for (const campo of Array.from(dialogo.querySelectorAll<HTMLInputElement>('input'))) {
    const tipo = campo.getAttribute('type');
    if (tipo !== 'text' && tipo !== 'password' && tipo !== null) continue;
    if (campo.getAttribute('role') === 'combobox') continue;
    if (campo.value !== '') continue;
    escribir(campo, 'TextoQueEscribeUnaPersona');
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
    // El asistente de generación entra en el barrido como una pantalla más: es
    // un formulario que escribe, y la regla de D-72 se le aplica igual. Aquí
    // además cubre lo contrario de lo habitual —no pide NINGÚN identificador,
    // solo cuántas y de qué medidas—, que es justo lo que había que conseguir.
    nombre: 'generación de padrón',
    elemento: <DirectorioDeViviendas copropiedadId={COP} />,
    boton: /Generar padrón/,
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
  {
    // ETAPA 15-B · el alta de equipos. Entra en el barrido como una pantalla
    // más: escribe, y la regla de D-72 se le aplica igual. Aquí lo que se
    // comprueba de paso es que un formulario de conexión —el sitio natural
    // para pedir «el id del dispositivo»— no pide ningún identificador
    // interno: pide dirección, usuario y clave, que es lo que el operador
    // tiene delante.
    nombre: 'equipos',
    elemento: <PantallaDeDispositivos copropiedadId={COP} />,
    boton: /Agregar equipo/,
  },
  {
    // ETAPA 15-D (O3) · el alta de zonas. Pide nombre, tipo, aforo e icono
    // —lo que el administrador tiene delante— y ningún identificador.
    nombre: 'zonas',
    elemento: <PantallaDeZonas copropiedadId={COP} />,
    boton: /Nueva zona/,
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
  /**
   * ETAPA 15-H (ADR-023/024) · supervisión de portería y consola del portero.
   * Ninguna pide un identificador tecleado: el portero de un turno sale de un
   * desplegable con los porteros que devuelve la API, y el resto de
   * identificadores viaja en la RUTA desde la fila o la sesión.
   */
  'porteros/dialogo-portero.tsx':
    'alta y datos del portero: usuario (nombre legible, no UUID), nombre y contacto; el usuarioId de la edición viene de la fila',
  'porteros/dialogo-turno.tsx':
    'el porteroId sale de un desplegable con los porteros que devuelve la API; día y horas son campos date/time del navegador',
  'porteros/calendario-de-turnos.tsx':
    'retirar un turno: el turnoId viene de la tarjeta; sólo se teclea el motivo',
  'componentes/cabecera.tsx': 'el botón «Patrullaje» no lleva cuerpo: la sesión sale del token',
  /**
   * ETAPA 15-I · supervisión de residentes. Ningún identificador se teclea: la
   * vivienda sale de un desplegable con las que devuelve la API, y la plaza, el
   * vehículo y la cuenta viajan en la RUTA desde su fila.
   */
  'residentes/dialogos.tsx':
    'alta del residente: usuario (nombre legible, no UUID), contraseña inicial, nombre y teléfono; el restablecimiento toma el usuarioId de la fila',
  'residentes/ocupantes.tsx':
    'la vivienda sale de un desplegable con las viviendas de la API; la plaza que se quita viene de su fila; sólo se teclean cantidad y motivo',
  'residentes/vehiculos-de-residentes.tsx':
    'desactivar: el vehiculoId viene de la fila; sólo se teclea el motivo',
  'componentes/bloqueo-de-patrullaje.tsx':
    'sólo se teclea el código de 4 dígitos que la consola mostraba',
  'componentes/buscador-personas.tsx':
    'es el buscador que RESUELVE la identidad por nombre o documento; su propio barrido está en buscador-personas.test.tsx',
  'componentes/configuracion-inicial.tsx':
    'pide dirección, tipo y las dos etiquetas de la copropiedad: ni un campo de identidad, y ninguna propiedad UUID en el cuerpo del PATCH',
  'porteria/pantalla.tsx':
    'la apertura manual actúa sobre el evento que ya está en pantalla; solo se teclea el motivo (RN-08)',
  'guardia/pantalla.tsx':
    'las órdenes actúan sobre el elemento en atención; no se introduce ninguna identidad',
  'dispositivos/pantalla.tsx': 'botones por fila del inventario; no hay campos que rellenar',
  /**
   * ETAPA 15-D (O4) · la ficha de un equipo en servicio: el equipo viene de la
   * fila, el servidor lo sondea con la clave guardada, y lo único que se
   * teclea es el MOTIVO de una corrección. Ningún identificador.
   */
  'dispositivos/ficha-dialogo.tsx':
    'el equipo viene de la fila; sólo se teclea el motivo de una corrección',
  'viviendas/carga-de-padron.tsx':
    'la entrada es un archivo, y su validación por fila la hace el servidor con reporte por fila',
  'configuracion/formulario.tsx':
    'campos numéricos con min/max declarados que el navegador impide enviar fuera de rango, y 422 por campo',
  /**
   * ETAPA 15 · no abre diálogo: es una secuencia de tres tarjetas en la propia
   * página, así que el recorrido de arriba —que busca `role="dialog"` y su
   * botón de envío— no la alcanza. El único identificador que viaja,
   * `titularId`, sale del buscador compartido, que SÍ entra en este barrido
   * por vivir en `componentes/`. Lo que aquí se declara lo comprueba
   * `biometria/pantalla.test.tsx`, con lo propio de una captura encima: que no
   * exista forma de aceptar el consentimiento desde la consola (RN-10) y que
   * sin detector de rostros no se invente uno.
   */
  'biometria/pantalla.tsx':
    'no es un diálogo; el único identificador lo aporta el buscador compartido, y tiene prueba propia',
  /**
   * ETAPA 15-E (A3) · el seguimiento tras la captura: dos botones —emitir el
   * enlace del titular y comprobar la respuesta para sincronizar a todas las
   * terminales—. Los dos identificadores (consentimiento y plantilla) vienen de
   * la captura recién hecha y viajan en la RUTA del POST; el único `<input>` es
   * de sólo lectura, para copiar el enlace. No hay nada que teclear. Lo que sí
   * comprueba `seguimiento.test.tsx` es que se muestre por terminal el estado
   * que la API devuelve.
   */
  'biometria/seguimiento.tsx':
    'dos botones; consentimiento y plantilla vienen de la captura y viajan en la ruta; el único input es de sólo lectura',
  /**
   * ETAPA 15-D (O3) · la fotografía del visitante: la entrada es un archivo de
   * imagen elegido con el selector del navegador, y el identificador de la
   * autorización viaja en la RUTA desde la tarjeta que lo muestra. No hay un
   * solo campo de texto.
   */
  'componentes/fotografia-visitante.tsx':
    'la entrada es un archivo; el identificador viaja en la ruta desde la tarjeta, nadie lo teclea',
};

/**
 * Se recorren las pantallas **y los componentes compartidos**, no solo las
 * primeras. El hueco se vio al construir el alta de viviendas: el diálogo de
 * configuración inicial escribe y vive en `componentes/`, así que el barrido
 * anterior no lo habría visto nunca. Un control que solo mira medio árbol
 * declara una cobertura que no tiene.
 */
const RAICES: readonly (readonly [string, string])[] = [
  [CONSOLA, ''],
  [resolve(process.cwd(), 'src/componentes'), 'componentes/'],
];

const ficherosQueEscriben = (directorio: string, raiz: string, prefijo: string): string[] =>
  readdirSync(directorio).flatMap((entrada) => {
    const ruta = join(directorio, entrada);
    if (statSync(ruta).isDirectory()) return ficherosQueEscriben(ruta, raiz, prefijo);
    if (!ruta.endsWith('.tsx') || ruta.endsWith('.test.tsx')) return [];
    return /cliente\.(POST|PATCH|PUT|DELETE)\(/.test(readFileSync(ruta, 'utf8'))
      ? [`${prefijo}${relative(raiz, ruta)}`]
      : [];
  });

const todasLasEscrituras = (): readonly string[] =>
  RAICES.flatMap(([raiz, prefijo]) => ficherosQueEscriben(raiz, raiz, prefijo));

describe('cobertura del barrido', () => {
  it('todas las escrituras de la consola están clasificadas', () => {
    const conFormulario = new Set([
      'viviendas/directorio.tsx',
      'viviendas/asistente-de-generacion.tsx',
      'vehiculos/pantalla.tsx',
      'visitantes/pantalla.tsx',
      'dispositivos/alta-de-equipo.tsx',
      'zonas/pantalla.tsx',
    ]);
    const sinClasificar = todasLasEscrituras().filter(
      (f) => !conFormulario.has(f) && SIN_FORMULARIO[f] === undefined,
    );
    expect(
      sinClasificar,
      'una pantalla nueva escribe y nadie la recorrió: añádela al barrido o declara por qué no lleva formulario',
    ).toEqual([]);
  });
});

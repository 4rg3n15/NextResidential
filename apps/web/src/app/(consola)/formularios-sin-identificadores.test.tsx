import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JSX, ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DirectorioDeViviendas } from './viviendas/directorio';
import { PantallaDeVehiculos } from './vehiculos/pantalla';
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
  ipsPorteria: [],
  ipsGuardiaRemota: [],
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

/**
 * Guardia estructural, en el espíritu del barrido de D-71: la lista de arriba
 * es explícita, así que algo tiene que vigilar que no se quede corta. Se
 * enumeran los ficheros de la consola que ESCRIBEN y se exige que cada uno esté
 * clasificado — con formulario que este barrido recorre, o exento con motivo.
 */
const SIN_FORMULARIO: Readonly<Record<string, string>> = {
  /**
   * 15-L (F) · exige FOTO con calidad y CASILLA marcada, que el barrido no da a
   * propósito; la vigencia es fecha, hora y duración de una lista. Lo prueba
   * `visitantes/generar-autorizacion.test.tsx` (cuerpo exacto; sin foto o
   * casilla no se envía nada).
   */
  'visitantes/generar-autorizacion.tsx':
    'foto y casilla obligatorias; la vivienda sale de un desplegable de la API; prueba propia del cuerpo enviado',
  /** 15-L (F2) · el rechazo sólo pide el MOTIVO; la visita viaja en la RUTA. */
  'componentes/rechazo-de-visita.tsx': 'sólo pide el motivo; la visita viaja en la ruta',
  'visitantes/pantalla.tsx':
    'lista y filtros; lo que escribe son el reintento de la foto (la plantilla viaja en la ruta) y los diálogos declarados aparte',
  /**
   * ETAPA 15-H (ADR-023/024) · supervisión de portería y consola del portero.
   * Ninguna pide un identificador tecleado: el portero de un turno sale de un
   * desplegable con los porteros que devuelve la API, y el resto de
   * identificadores viaja en la RUTA desde la fila o la sesión.
   */
  'porteros/dialogo-portero.tsx':
    'alta y datos del portero: documento, nombre y contacto (el número lo asigna la API); el usuarioId de la edición viene de la fila',
  'porteros/dialogo-turno.tsx':
    'el porteroId sale de un desplegable con los porteros que devuelve la API; día y horas son campos date/time del navegador',
  'porteros/calendario-de-turnos.tsx':
    'retirar un turno: el turnoId viene de la tarjeta; sólo se teclea el motivo',
  'componentes/cabecera.tsx': 'el botón «Patrullaje» no lleva cuerpo: la sesión sale del token',
  /** G2 (15-N) · preferencias de atención: sólo casillas; la copropiedad viaja en la ruta. */
  'configuracion/preferencias-de-atencion.tsx':
    'diez casillas (abrir sola / sonar por disparador); ningún texto ni identificador tecleado',
  /**
   * ETAPA 15-I · supervisión de residentes. Ningún identificador se teclea: la
   * vivienda sale de un desplegable con las que devuelve la API, y la plaza, el
   * vehículo y la cuenta viajan en la RUTA desde su fila.
   */
  'residentes/dialogos.tsx':
    'alta del titular: usuario (nombre legible, no UUID), contraseña inicial, nombre y teléfono; la vivienda se elige de la lista de viviendas sin titular que devuelve la API, buscada por número o agrupación; el restablecimiento toma el usuarioId de la fila; prueba propia del cuerpo enviado',
  'residentes/ocupantes.tsx':
    'la vivienda sale de un desplegable con las viviendas de la API; la plaza que se quita viene de su fila; sólo se teclean cantidad y motivo',
  'residentes/vehiculos-de-residentes.tsx':
    'desactivar: el vehiculoId viene de la fila; sólo se teclea el motivo',
  /**
   * RONDA 15-W · titulares, plazas y registro. Ninguna pide un identificador
   * tecleado: la cuenta viaja en la RUTA desde su fila, la vivienda se ELIGE de
   * la lista de viviendas sin titular que devuelve la API (o viaja en la ruta
   * desde el selector de la ficha), y lo único que se teclea es un número de
   * plazas y el motivo. El barrido no puede recorrerlas: el alta exige una
   * contraseña que cumpla la política y las demás leen listas que su servidor
   * falso no siembra. Lo comprueban `residentes/titulares.test.tsx`,
   * `residentes/tope-de-plazas.test.tsx` y
   * `configuracion/registro-y-plazas.test.tsx`, que leen el cuerpo exacto.
   */
  'residentes/asignar-vivienda.tsx':
    'la cuenta viaja en la ruta desde su fila; la vivienda se elige de la lista de la API; sólo se teclea el motivo; prueba propia del cuerpo enviado',
  'residentes/tope-de-plazas.tsx':
    'la vivienda viaja en la ruta desde el selector de la ficha; se teclean el número de plazas y el motivo; prueba propia del cuerpo enviado',
  'configuracion/registro-de-residentes.tsx':
    'reanudar sólo pide el motivo; la copropiedad viaja en la ruta; prueba propia del cuerpo enviado',
  'configuracion/tope-de-plazas-por-omision.tsx':
    'número de plazas y motivo en texto; la copropiedad viaja en la ruta; prueba propia del cuerpo enviado',
  /**
   * ETAPA 15-I · HU-35 · la lista negra. Se teclean una PLACA o un DOCUMENTO,
   * que son identificadores legibles, nunca un UUID: el servidor resuelve el
   * documento a su persona en ESA copropiedad. Levantar toma el vetoId de la fila.
   */
  'listas-negras/pantalla.tsx':
    'vetar: placa o documento legibles (la persona la resuelve el servidor) y motivo; levantar toma el vetoId de la fila',
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
  'dispositivos/edge-del-conjunto.tsx': 'dos botones (15-Q2); el edgeId viene de la fila',
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
   * ETAPA 15-L (F) · la foto del visitante: un archivo de imagen elegido con el
   * selector o la cámara. No hay un solo campo de texto.
   */
  'componentes/captura-de-foto.tsx': 'la entrada es un archivo de imagen; no hay campo de texto',
  /**
   * ETAPA 15-K (D-11) · la atestación del instalador: dos placas, «ninguna
   * abrió» y la evidencia en texto. El equipo viaja en la RUTA desde su fila;
   * el diálogo sólo aparece para el superadministrador y con una cámara en el
   * inventario, que este barrido (inventario vacío) no siembra. Lo comprueba
   * `dispositivos/atestacion-dialogo.test.tsx`: el cuerpo exacto que envía.
   */
  'dispositivos/atestacion-dialogo.tsx':
    'placas y evidencia en texto; el equipo viaja en la ruta; prueba propia del cuerpo enviado',
  /**
   * 15-L (H5) · el interruptor del modo pruebas: dos botones, un booleano. No
   * hay campo de texto.
   */
  'configuracion/modo-pruebas.tsx': 'un interruptor: envía un booleano, nadie teclea nada',
  /**
   * Corrección de la 15-L · las acciones de la ficha: «Enviar eventos a este
   * Mac» y el interruptor de la verificación remota. El equipo viaja en la
   * RUTA desde su ficha; el cuerpo es el motivo ya escrito en la ficha y un
   * booleano. Lo comprueba `dispositivos/acciones-de-sitio.test.tsx`.
   */
  'dispositivos/acciones-de-sitio.tsx':
    'el equipo viaja en la ruta; el cuerpo es el motivo de la ficha y un booleano',
  /**
   * 15-L (H1, H2) · el cupo es un número de 0 a 999 y la baja lleva un motivo
   * en texto; el portero viaja en la RUTA desde la fila que lo muestra.
   */
  /**
   * 15-L (G) · el perfil de un residente: nombres, documento y contacto en
   * texto; el residente viaja en la RUTA desde su fila.
   */
  'residentes/perfil-de-residente.tsx':
    'datos personales en texto; el residente viaja en la ruta desde su fila, nadie lo teclea',
  'porteros/pool-y-baja.tsx':
    'cupo numérico y motivo en texto; el portero viaja en la ruta desde su fila, nadie lo teclea',
  /**
   * ETAPA 15-M (C3, D-12) · el residente en la consola. Ninguna de sus
   * escrituras pide un identificador: la vivienda la resuelve la API desde el
   * token y nunca viaja ni en la ruta ni en el cuerpo. La visita exige FOTO y
   * CASILLA, que el barrido no sabe dar a propósito; los ocupantes de un
   * vehículo son casillas con los residentes que devuelve la API; el vehículo
   * que se da de baja y el visitante que se vuelve a autorizar viajan en la
   * RUTA desde su tarjeta. Lo comprueba `mi/formularios.test.tsx`: el cuerpo
   * exacto que envía cada uno.
   */
  'mi/visitas/nueva-visita.tsx':
    'foto y casilla obligatorias; nombre, documento, fecha, hora, duración y placa en texto; prueba propia del cuerpo enviado',
  'mi/visitas/volver-a-autorizar.tsx':
    'sólo fecha, hora, duración y casilla; el visitante viaja en la ruta desde su tarjeta',
  'mi/vehiculos/nuevo-vehiculo.tsx':
    'placa, color, modelo, marca y tipo en texto; los ocupantes son casillas con los residentes que devuelve la API',
  'mi/vehiculos/pantalla.tsx':
    'dar de baja: el vehículo viaja en la ruta desde su tarjeta; no hay campos',
  'mi/perfil/editar-perfil.tsx':
    'datos personales y de contacto en texto; el correo exige «@» y el teléfono cifras, que el barrido no teclea',
  /**
   * ETAPA 15-M (C10, C4, C9) · la apertura por equipo, la baja de un equipo y
   * la baja de un residente. El equipo o el residente viajan en la RUTA (o en
   * el cuerpo, elegido de una lista que devuelve la API); lo único que se
   * teclea es el MOTIVO, en texto. Lo comprueban `guardia/equipos-en-vivo.test.tsx`
   * y las pruebas de cada diálogo: el cuerpo exacto que envían.
   */
  'guardia/equipos-en-vivo.tsx':
    'el equipo se elige de la lista que devuelve la API; el motivo en texto; prueba propia del cuerpo enviado',
  'dispositivos/baja-de-equipo.tsx':
    'el equipo viaja en la ruta desde su fila; motivo en texto y casilla de confirmación',
  'residentes/baja-de-residente.tsx':
    'el residente viaja en la ruta desde su fila; motivo en texto y casilla de confirmación',
  /**
   * E5 / C7 (15-M) · archivar alertas: las alertas se MARCAN en la lista que
   * devuelve la API y viajan por su id (en la ruta o en `ids`); lo único que
   * se teclea es el motivo. Lo comprueba `eventos/alertas-abiertas.test.tsx`.
   */
  'eventos/alertas-abiertas.tsx':
    'las alertas se marcan de la lista que devuelve la API; sólo el motivo se teclea; prueba propia del cuerpo',
  /**
   * 15-P · P3 · las salidas del videoportero: «Descubrir» no lleva cuerpo, y el
   * punto que se renombra viaja EN LA RUTA con el id que devolvió la API; lo
   * único que se teclea es el nombre (texto, 1–80). Lo comprueba
   * `dispositivos/salidas-del-equipo.test.tsx`, que mira ruta y cuerpo.
   */
  'dispositivos/salidas-del-equipo.tsx':
    'descubrir va sin cuerpo; el punto viaja en la ruta con el id de la API; sólo el nombre se teclea; prueba propia de ruta y cuerpo',
  'dispositivos/modo-de-la-puerta.tsx':
    '15-R · P-25: el equipo y la puerta salen de la ficha; se elige el plazo de una lista y sólo se teclea el motivo',
  'componentes/franja-de-puertas.tsx':
    '15-R · P-25: «revertir ahora» envía el equipo y la puerta de la orden vigente que devolvió la API; nada se teclea',
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

import type { Reloj } from '@ncr/domain-core';
import { MockProvider } from './mock/mock-provider';
import type { PerfilDeSimulacion } from './mock/simulacion';
import { HikvisionProvider } from './hikvision/hikvision-provider';
import { RegistroEnMemoria } from './hikvision/registro-de-equipos';
import type { EquipoRegistrado, RegistroDeEquipos } from './hikvision/registro-de-equipos';
import type { FuenteDePlacas } from './equipo/fuente-de-placas';
import type { ProveedorDeEquipos } from './nucleo/proveedor';

export type { ProveedorDeEquipos } from './nucleo/proveedor';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PUNTO DE COMPOSICIÓN · aquí ADR-03 se demuestra o no se demuestra
 *
 * Hasta la 15-C **no existía**. El módulo de biometría hacía `new MockProvider`
 * en su fábrica de proveedor, así que cambiar de adaptador exigía **editar un
 * módulo de la API**: justo lo que ADR-03 dice que no debe pasar.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * DESDE LA 15-D ES UN REGISTRO, NO UN `if` · O2
 *
 * La versión de la 15-C preguntaba `clase === 'simulado'` y, si no, construía
 * el adaptador de una marca. Eso es un acoplamiento por nombre de marca en el
 * único sitio donde no debería haberlo: añadir un fabricante exigía tocar la
 * fábrica. Ahora cada adaptador **se registra** con su clase y su constructor,
 * y la fábrica sólo busca. Añadir una marca es registrar una entrada; nada de
 * lo que ya existe cambia.
 *
 * La prueba de fuego que O2 pide —«un adaptador ficticio de una marca
 * inventada, con capacidades reducidas, pasa la suite de contrato sin que se
 * toque una línea de dominio»— vive en `src/ficticio/` y se registra desde su
 * propia prueba con `produccion: false`. **Nunca desde este fichero** y nunca
 * desde el barril: una marca inventada no puede acabar en un despliegue por
 * un nombre mal escrito en una variable de entorno.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA VERIFICACIÓN, Y QUÉ SIGNIFICA QUE PASE
 *
 * Cambiar `simulado` por `hikvision` **no cambia una línea** de dominio, de
 * aplicación ni de interfaz. Lo que **no** demuestra: que el equipo responda
 * como la guía dice. Que los adaptadores sean intercambiables se prueba contra
 * un simulado. Que el aparato se comporte como el simulado finge, no.
 */

/** Las clases que un despliegue puede pedir. El adaptador ficticio NO está. */
export const CLASES_DE_PROVEEDOR = ['simulado', 'hikvision'] as const;
export type ClaseDeProveedor = (typeof CLASES_DE_PROVEEDOR)[number];

export interface ConfiguracionDeProveedor {
  /** Una clase de producción, o una registrada sólo para pruebas. */
  readonly clase: ClaseDeProveedor | (string & {});
  readonly reloj: Reloj;
  /** Sólo con un adaptador de hardware. Sin registro, no hay a quién hablar. */
  readonly registro?: RegistroDeEquipos;
  /** Atajo para pruebas y arranque sin base: un registro de memoria. */
  readonly equipos?: readonly EquipoRegistrado[];
  readonly fuente?: FuenteDePlacas;
  /** Inyectable para que la suite corra sin red y sin equipo. */
  readonly peticion?: typeof fetch;
  /** Semilla del simulado: la adversidad tiene que ser reproducible. */
  readonly semilla?: number;
  readonly dispositivosSimulados?: readonly string[];
  /**
   * Perfil del simulado. La suite de contrato pide el IDEAL porque compara los
   * proveedores: con latencia y fallos aleatorios en uno y no en otro, la
   * comparación mediría el generador de adversidad y no la equivalencia.
   */
  readonly perfil?: PerfilDeSimulacion;
  /** `false` sólo en pruebas que no van contra una cámara. Nunca en producción. */
  readonly exigirVeredictoDeControl?: boolean;
}

export class ConfiguracionDeProveedorIncompleta extends Error {
  constructor(motivo: string) {
    super(`No se puede componer el proveedor de equipos: ${motivo}`);
    this.name = 'ConfiguracionDeProveedorIncompleta';
  }
}

/** Lo que un adaptador declara al registrarse. */
export interface AdaptadorRegistrado {
  readonly clase: string;
  /**
   * `true` sólo para los adaptadores que un despliegue puede elegir. Un
   * adaptador de prueba se registra con `false` y `claseDeProveedorDe` —la
   * lectura del entorno— lo rechaza aunque exista.
   */
  readonly produccion: boolean;
  readonly crear: (configuracion: ConfiguracionDeProveedor) => ProveedorDeEquipos;
}

const adaptadores = new Map<string, AdaptadorRegistrado>();

/**
 * Registra un adaptador. Dos veces la misma clase es un error de programación:
 * el segundo pisaría al primero y nadie sabría cuál se está inyectando.
 */
export const registrarAdaptador = (adaptador: AdaptadorRegistrado): void => {
  if (adaptadores.has(adaptador.clase)) {
    throw new ConfiguracionDeProveedorIncompleta(
      `la clase «${adaptador.clase}» ya está registrada; dos adaptadores con el mismo nombre ` +
        'dejarían sin saber cuál se inyecta',
    );
  }
  adaptadores.set(adaptador.clase, adaptador);
};

/** Las clases registradas ahora mismo, de producción o no. Para diagnóstico. */
export const clasesRegistradas = (): readonly string[] => [...adaptadores.keys()];

/**
 * El registro de equipos que un adaptador de hardware necesita, o un error que
 * NO cae al simulado: caer al simulado dejaría un despliegue que cree hablar
 * con las cámaras y no habla con ninguna, informando de aperturas que nunca
 * ocurren.
 */
export const registroExigido = (configuracion: ConfiguracionDeProveedor): RegistroDeEquipos => {
  const registro =
    configuracion.registro ??
    (configuracion.equipos === undefined ? null : new RegistroEnMemoria(configuracion.equipos));
  if (registro === null) {
    throw new ConfiguracionDeProveedorIncompleta(
      'se pidió un adaptador de hardware y no hay registro de equipos. No se cae al simulado ' +
        'a propósito: un despliegue que cree hablar con las cámaras y no habla con ninguna ' +
        'informaría de aperturas que nunca ocurrieron',
    );
  }
  return registro;
};

// ── Los dos adaptadores de producción se registran aquí, y sólo aquí ─────────
registrarAdaptador({
  clase: 'simulado',
  produccion: true,
  crear: (configuracion) =>
    new MockProvider({
      ...(configuracion.perfil === undefined ? {} : { perfil: configuracion.perfil }),
      ...(configuracion.semilla === undefined ? {} : { semilla: configuracion.semilla }),
      ...(configuracion.dispositivosSimulados === undefined
        ? {}
        : { dispositivos: configuracion.dispositivosSimulados }),
    }),
});

registrarAdaptador({
  clase: 'hikvision',
  produccion: true,
  crear: (configuracion) =>
    new HikvisionProvider({
      registro: registroExigido(configuracion),
      reloj: configuracion.reloj,
      ...(configuracion.peticion === undefined ? {} : { peticion: configuracion.peticion }),
      ...(configuracion.fuente === undefined ? {} : { fuente: configuracion.fuente }),
      ...(configuracion.exigirVeredictoDeControl === undefined
        ? {}
        : { exigirVeredictoDeControl: configuracion.exigirVeredictoDeControl }),
    }),
});

/**
 * Compone el proveedor. **Un solo sitio, una sola decisión.**
 *
 * Una clase que no está registrada **no cae a ningún lado**: ni al simulado
 * —dejaría un despliegue que cree hablar con las cámaras— ni al hardware —una
 * variable mal escrita pondría la API en modo equipo sin que nadie lo
 * decidiera—. Lo desconocido rompe.
 */
export const crearProveedorDeEquipos = (
  configuracion: ConfiguracionDeProveedor,
): ProveedorDeEquipos => {
  const clase = typeof configuracion.clase === 'string' ? configuracion.clase : '';
  const adaptador = adaptadores.get(clase);
  if (adaptador === undefined) {
    throw new ConfiguracionDeProveedorIncompleta(
      `«${String(configuracion.clase)}» no es una clase conocida. Las válidas son: ` +
        CLASES_DE_PROVEEDOR.join(', '),
    );
  }
  return adaptador.crear(configuracion);
};

/**
 * Lee la clase de proveedor de un valor de entorno, con el conservador por
 * omisión, y **sólo de producción**: un adaptador registrado para pruebas no
 * se puede pedir desde el entorno aunque exista en el proceso.
 *
 * El simulado es el de por omisión y lo seguirá siendo: ADR-03 dice que todo el
 * sistema debe funcionar completo contra él, y un despliegue que se ponga en
 * modo hardware por descuido es peor que uno que se quede en simulado.
 */
export const claseDeProveedorDe = (valor: string | undefined): ClaseDeProveedor => {
  const normalizado = (valor ?? '').trim().toLowerCase();
  if (normalizado === '') return 'simulado';
  const encontrada = CLASES_DE_PROVEEDOR.find((c) => c === normalizado);
  if (encontrada === undefined || adaptadores.get(encontrada)?.produccion !== true) {
    throw new ConfiguracionDeProveedorIncompleta(
      `«${normalizado}» no es una clase conocida. Las válidas son: ${CLASES_DE_PROVEEDOR.join(', ')}`,
    );
  }
  return encontrada;
};

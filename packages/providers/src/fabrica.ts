import type {
  AccessPointProvider,
  FaceTemplateProvider,
  IntercomProvider,
  PlateEventSource,
  Reloj,
} from '@ncr/domain-core';
import { MockProvider } from './mock/mock-provider';
import type { PerfilDeSimulacion } from './mock/simulacion';
import { HikvisionProvider } from './hikvision/hikvision-provider';
import { RegistroEnMemoria } from './hikvision/registro-de-equipos';
import type { EquipoRegistrado, RegistroDeEquipos } from './hikvision/registro-de-equipos';
import type { FuenteDePlacas } from './equipo/fuente-de-placas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PUNTO DE COMPOSICIÓN · aquí ADR-03 se demuestra o no se demuestra
 *
 * Hasta la 15-C **no existía**. El módulo de biometría hacía `new MockProvider`
 * en su fábrica de proveedor, así que cambiar de adaptador exigía **editar un
 * módulo de la API**: justo lo que ADR-03 dice que no debe pasar, y en el único
 * sitio donde se podía comprobar que no pasaba.
 *
 * Ahora la decisión vive en una variable de entorno validada al arranque, y
 * este fichero es el **único** del proyecto que menciona a los dos adaptadores.
 * Fuera de aquí no hay un solo `if` sobre el fabricante — biometría incluida.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA VERIFICACIÓN, Y QUÉ SIGNIFICA QUE PASE
 *
 * Cambiar `simulado` por `hikvision` **no cambia una línea** de dominio, de
 * aplicación ni de interfaz. Si obligara a tocarlas, sería un defecto de diseño
 * de las etapas anteriores y habría que pararse y reportarlo antes de tocar
 * nada. Esa comprobación es, en sí misma, la prueba de OE-03.
 *
 * Lo que **no** demuestra: que el equipo responda como la guía dice. Que los
 * dos proveedores sean intercambiables se prueba contra un simulado. Que el
 * aparato se comporte como el simulado finge, no.
 */

/** Lo que cualquiera de los dos proveedores cumple: los cuatro puertos. */
export type ProveedorDeEquipos = AccessPointProvider &
  PlateEventSource &
  FaceTemplateProvider &
  IntercomProvider;

export const CLASES_DE_PROVEEDOR = ['simulado', 'hikvision'] as const;
export type ClaseDeProveedor = (typeof CLASES_DE_PROVEEDOR)[number];

export interface ConfiguracionDeProveedor {
  readonly clase: ClaseDeProveedor;
  readonly reloj: Reloj;
  /** Sólo con `hikvision`. Sin registro, no hay a quién hablar. */
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
   * dos proveedores: con latencia y fallos aleatorios en uno y no en el otro,
   * la comparación mediría el generador de adversidad y no la equivalencia.
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

/**
 * Compone el proveedor. **Un solo sitio, una sola decisión.**
 *
 * `hikvision` sin registro de equipos lanza, y no cae al simulado: caer al
 * simulado dejaría un despliegue que cree hablar con las cámaras y no habla con
 * ninguna, informando de aperturas que nunca ocurren. Es el mismo modo de fallo
 * que ya obligó a que una configuración de barrera a medias también lance.
 */
export const crearProveedorDeEquipos = (
  configuracion: ConfiguracionDeProveedor,
): ProveedorDeEquipos => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * UNA CLASE QUE NO ES NINGUNA DE LAS DOS **NO CAE AL LADO DEL HARDWARE**
   *
   * La primera versión preguntaba `=== 'simulado'` y se iba al adaptador real
   * en cualquier otro caso, `undefined` incluido. El efecto lo destapó la suite
   * entera: un banco de pruebas al que le faltaba el campo pedía hardware sin
   * haberlo pedido nunca. En un despliegue, lo mismo: una variable mal escrita
   * habría puesto la API en modo equipo sin que nadie lo decidiera.
   *
   * Se comprueba contra la lista, y lo desconocido rompe. Entre «no es ninguno
   * de los dos» y «me quedo con uno», la segunda opción es cómo un sistema
   * acaba en un modo que nadie eligió.
   */
  if (!CLASES_DE_PROVEEDOR.includes(configuracion.clase)) {
    throw new ConfiguracionDeProveedorIncompleta(
      `«${String(configuracion.clase)}» no es una clase conocida. Las válidas son: ` +
        CLASES_DE_PROVEEDOR.join(', '),
    );
  }
  if (configuracion.clase === 'simulado') {
    return new MockProvider({
      ...(configuracion.perfil === undefined ? {} : { perfil: configuracion.perfil }),
      ...(configuracion.semilla === undefined ? {} : { semilla: configuracion.semilla }),
      ...(configuracion.dispositivosSimulados === undefined
        ? {}
        : { dispositivos: configuracion.dispositivosSimulados }),
    });
  }

  const registro =
    configuracion.registro ??
    (configuracion.equipos === undefined ? null : new RegistroEnMemoria(configuracion.equipos));
  if (registro === null) {
    throw new ConfiguracionDeProveedorIncompleta(
      'se pidió el adaptador de hardware y no hay registro de equipos. No se cae al simulado ' +
        'a propósito: un despliegue que cree hablar con las cámaras y no habla con ninguna ' +
        'informaría de aperturas que nunca ocurrieron',
    );
  }

  return new HikvisionProvider({
    registro,
    reloj: configuracion.reloj,
    ...(configuracion.peticion === undefined ? {} : { peticion: configuracion.peticion }),
    ...(configuracion.fuente === undefined ? {} : { fuente: configuracion.fuente }),
    ...(configuracion.exigirVeredictoDeControl === undefined
      ? {}
      : { exigirVeredictoDeControl: configuracion.exigirVeredictoDeControl }),
  });
};

/**
 * Lee la clase de proveedor de un valor de entorno, con el conservador por
 * omisión.
 *
 * El simulado es el de por omisión y lo seguirá siendo: ADR-03 dice que todo el
 * sistema debe funcionar completo contra él, y un despliegue que se ponga en
 * modo hardware por descuido es peor que uno que se quede en simulado.
 */
export const claseDeProveedorDe = (valor: string | undefined): ClaseDeProveedor => {
  const normalizado = (valor ?? '').trim().toLowerCase();
  if (normalizado === '') return 'simulado';
  const encontrada = CLASES_DE_PROVEEDOR.find((c) => c === normalizado);
  if (encontrada === undefined) {
    throw new ConfiguracionDeProveedorIncompleta(
      `«${normalizado}» no es una clase conocida. Las válidas son: ${CLASES_DE_PROVEEDOR.join(', ')}`,
    );
  }
  return encontrada;
};

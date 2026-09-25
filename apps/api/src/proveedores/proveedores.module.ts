import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import {
  ACCESS_POINT_PROVIDER,
  BITACORA,
  FACE_TEMPLATE_PROVIDER,
  INTERCOM_PROVIDER,
  PLATE_EVENT_SOURCE,
  RELOJ,
} from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { Pool } from 'pg';
import { FuenteDePlacas, crearProveedorDeEquipos } from '@ncr/providers';
import type { ClaseDeProveedor, ProveedorDeEquipos, RegistroDeEquipos } from '@ncr/providers';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PUNTO DE COMPOSICIÓN DE LOS PROVEEDORES · ETAPA 15-C
 *
 * ADR-03 dice que el hardware va al final y que eso es una prueba: cambiar de
 * adaptador no debe tocar nada más. Hasta hoy **no se podía comprobar**, porque
 * no había dónde: el módulo de biometría hacía `new MockProvider` dentro de su
 * propia fábrica, así que «cambiar de proveedor» significaba editar un módulo
 * de la API — exactamente lo que el ADR prohíbe.
 *
 * Este módulo es ese sitio, y es el **único**. Los cuatro puertos se resuelven
 * de una sola instancia, porque es **un equipo**: el estado que comparten —qué
 * dispositivos existen, qué canal de audio está ocupado— es el mismo estado, y
 * separarlo obligaría a sincronizar cuatro copias de la verdad.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ES `@Global` A PROPÓSITO, Y NO POR COMODIDAD
 *
 * Los cuatro puertos los consumen módulos que no se conocen entre sí —biometría
 * sincroniza plantillas, guardia abre puertas, el receptor publica placas—. Sin
 * `@Global`, cada uno tendría que importar este módulo, y **el primero que se
 * olvidara volvería a construirse el suyo**: dos instancias, dos conjuntos de
 * plantillas, y una supresión que no suprime la que la terminal tiene.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * UNA SOLA FUENTE DE PLACAS · ETAPA 15-E (A1)
 *
 * Hasta la 15-E había DOS: la que el adaptador real creaba por dentro —la que
 * `PLATE_EVENT_SOURCE.suscribir` observaba— y la que el receptor del «servidor
 * de alarma» creaba para su ingestor. Publicar en una no llegaba a la otra, así
 * que el puerto del dominio seguía siendo un adorno con otro nombre. La fuente
 * se construye AQUÍ, se entrega al adaptador por la fábrica y se exporta con
 * token propio para que el receptor publique en la MISMA. Un solo ingestor, un
 * solo camino a `RegistrarAcceso`, y los observadores del puerto ven todo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA VERIFICACIÓN DE OE-03, EN UNA FRASE
 *
 * Cambiar `PROVEEDOR_DE_EQUIPOS` del adaptador simulado al real no toca una
 * línea de dominio, de aplicación ni de interfaz. Si obligara a tocarlas, sería
 * un defecto de diseño de las etapas anteriores y habría que pararse y
 * reportarlo.
 */

/**
 * La instancia ÚNICA del proveedor, con la pregunta que el dominio no hace
 * (`capacidadesDe`) y el bloqueo (H-3). Quien necesite los cuatro puertos como
 * uno solo —el accionador, el canal de intercom— la toma por aquí.
 */
export const PROVEEDOR_DE_EQUIPOS = Symbol.for('ncr.proveedores.Instancia');

/** La fuente por la que entran las placas: la comparten adaptador y receptor. */
export const FUENTE_DE_PLACAS = Symbol.for('ncr.proveedores.FuenteDePlacas');

@Global()
@Module({})
export class ProveedoresModule {
  static registrar(opciones: {
    readonly clase: ClaseDeProveedor;
    readonly registro?: RegistroDeEquipos;
    /**
     * ETAPA 15-D (D5) · cómo construir el registro de equipos cuando la clase
     * es de hardware. Recibe el `Pool` y la configuración del proceso, porque
     * el registro lee la base y descifra el sobre con la llave de equipos.
     * Sin esto, el modo hardware estaba escrito y no se podía encender: la
     * fábrica lanzaba al arrancar por falta de registro.
     */
    readonly registroDesde?: (dependencias: {
      readonly pool: Pool;
      readonly configuracion: Configuracion;
    }) => RegistroDeEquipos;
    /** Semilla del simulado: la adversidad tiene que ser reproducible. */
    readonly semilla?: number;
  }): DynamicModule {
    const alias = [
      ACCESS_POINT_PROVIDER,
      PLATE_EVENT_SOURCE,
      FACE_TEMPLATE_PROVIDER,
      INTERCOM_PROVIDER,
    ].map((token) => ({
      provide: token,
      inject: [PROVEEDOR_DE_EQUIPOS],
      useFactory: (proveedor: ProveedorDeEquipos) => proveedor,
    }));

    return {
      module: ProveedoresModule,
      providers: [
        { provide: FUENTE_DE_PLACAS, useFactory: () => new FuenteDePlacas() },
        {
          /**
           * Token intermedio, y no cuatro fábricas: con cuatro habría cuatro
           * instancias. Es el mismo defecto que ya obligó a que el almacén de
           * plantillas fuese un proveedor propio en vez de un `new` dentro de
           * otra fábrica, y la misma solución.
           */
          provide: PROVEEDOR_DE_EQUIPOS,
          inject: [RELOJ, BITACORA, Pool, CONFIGURACION, FUENTE_DE_PLACAS],
          useFactory: (
            reloj: Reloj,
            bitacora: Bitacora,
            pool: Pool,
            configuracion: Configuracion,
            fuente: FuenteDePlacas,
          ) => {
            const registro =
              opciones.registro ??
              (opciones.clase === 'simulado' || opciones.registroDesde === undefined
                ? undefined
                : opciones.registroDesde({ pool, configuracion }));
            /**
             * Se dice al arrancar cuál es el adaptador ACTIVO. Un despliegue en
             * modo simulado que cree hablar con las cámaras es el modo de fallo
             * que ADR-03 más teme, y esta línea en el registro es lo que lo
             * destapa antes de la primera apertura que no ocurre.
             */
            bitacora.registrar('info', `proveedor de equipos activo: ${opciones.clase}`, {
              clase: opciones.clase,
              conRegistroDeEquipos: registro !== undefined,
              consecuencia:
                opciones.clase === 'simulado'
                  ? 'ningún equipo físico recibe órdenes; las aperturas son simuladas'
                  : 'las órdenes van a los equipos dados de alta en la consola',
            });
            return crearProveedorDeEquipos({
              clase: opciones.clase,
              reloj,
              fuente,
              ...(registro === undefined ? {} : { registro }),
              ...(opciones.semilla === undefined ? {} : { semilla: opciones.semilla }),
            });
          },
        },
        ...alias,
      ],
      exports: [
        PROVEEDOR_DE_EQUIPOS,
        FUENTE_DE_PLACAS,
        ACCESS_POINT_PROVIDER,
        PLATE_EVENT_SOURCE,
        FACE_TEMPLATE_PROVIDER,
        INTERCOM_PROVIDER,
      ],
    };
  }
}

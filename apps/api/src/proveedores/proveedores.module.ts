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
import { ProveedorEnrutado } from './proveedor-enrutado';
import { RUTAS_DE_EQUIPOS, RutasDeEquiposPg, TODO_DIRECTO } from './rutas-de-equipos';
import type { RutasDeEquipos } from './rutas-de-equipos';
import { TUNELES_DE_EDGE, TunelesDeEdge } from './tuneles-de-edge';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PUNTO DE COMPOSICIÓN DE LOS PROVEEDORES · ETAPA 15-C
 *
 * ADR-03: cambiar de adaptador no toca nada más, y aquí se comprueba. Es el
 * ÚNICO sitio: los cuatro puertos salen de UNA instancia, porque es UN equipo.
 * `@Global` porque los consumen módulos que no se conocen: el que olvidara
 * importarlo se construiría el suyo (una supresión que no suprime).
 *
 * UNA SOLA FUENTE DE PLACAS (15-E, A1): se entrega al adaptador y se exporta
 * para que el receptor publique en la MISMA. Un solo camino a `RegistrarAcceso`.
 *
 * 15-Q2 (ADR-035) · `PROVEEDOR_DE_EQUIPOS` es un `ProveedorEnrutado`: delante
 * del DIRECTO (`PROVEEDOR_DIRECTO`, el de siempre) y de un remoto por cada
 * copropiedad con Edge puente. Sin puente, todo va directo, como antes (R1).
 *
 * OE-03: cambiar el directo del simulado al real no toca dominio ni interfaz.
 */

/**
 * La instancia ÚNICA del proveedor, con la pregunta que el dominio no hace
 * (`capacidadesDe`) y el bloqueo (H-3). Quien necesite los cuatro puertos como
 * uno solo —el accionador, el canal de intercom— la toma por aquí.
 */
export const PROVEEDOR_DE_EQUIPOS = Symbol.for('ncr.proveedores.Instancia');
/** 15-Q2 · el que habla con los equipos desde ESTE proceso (sin pasar por un Edge). */
export const PROVEEDOR_DIRECTO = Symbol.for('ncr.proveedores.Directo');

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
    /**
     * 15-K (§4) · con base real, qué equipos reconoce el SIMULADO: los activos
     * de `dispositivos`. Sin esto, toda orden a un equipo dado de alta en la
     * consola fallaba en modo simulado, que es el modo por omisión (ADR-03).
     */
    readonly conocidoDesde?: (dependencias: {
      readonly pool: Pool;
      readonly configuracion: Configuracion;
    }) => (dispositivoId: string) => Promise<boolean>;
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
        { provide: TUNELES_DE_EDGE, useFactory: () => new TunelesDeEdge() },
        {
          provide: RUTAS_DE_EQUIPOS,
          inject: [Pool, CONFIGURACION],
          useFactory: (pool: Pool, c: Configuracion): RutasDeEquipos =>
            c.PERSISTENCIA_DE_EVENTOS === 'postgres' ? new RutasDeEquiposPg(pool) : TODO_DIRECTO,
        },
        {
          provide: PROVEEDOR_DE_EQUIPOS,
          inject: [PROVEEDOR_DIRECTO, RUTAS_DE_EQUIPOS, TUNELES_DE_EDGE, FUENTE_DE_PLACAS],
          useFactory: (
            directo: ProveedorDeEquipos,
            rutas: RutasDeEquipos,
            tuneles: TunelesDeEdge,
            fuente: FuenteDePlacas,
          ) =>
            // Sin base no hay puentes: la instancia es la de siempre, idéntica (R1).
            rutas === TODO_DIRECTO
              ? directo
              : new ProveedorEnrutado(directo, rutas, tuneles, fuente),
        },
        {
          // Token intermedio y no cuatro fábricas: con cuatro habría cuatro instancias.
          provide: PROVEEDOR_DIRECTO,
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
            const equipoConocido =
              opciones.clase === 'simulado' &&
              configuracion.PERSISTENCIA_DE_EVENTOS === 'postgres' &&
              opciones.conocidoDesde !== undefined
                ? opciones.conocidoDesde({ pool, configuracion })
                : undefined;
            return crearProveedorDeEquipos({
              clase: opciones.clase,
              ...(equipoConocido === undefined ? {} : { equipoConocido }),
              reloj,
              fuente,
              // H-SITIO-12/13/14 · lo que pasa con los equipos, a la bitácora.
              traza: bitacora,
              // A5 (15-L) · el plazo de cada petición, del `.env`.
              tiempoLimiteMs: configuracion.EQUIPOS_TIEMPO_LIMITE_MS,
              // A2 (15-L) · la persona y la foto que van a una terminal.
              persona: {
                zonaHoraria: configuracion.EQUIPOS_ZONA_HORARIA,
                planDeHorario: configuracion.TERMINAL_PLAN_DE_HORARIO,
              },
              limitesDeFoto: {
                bytesMaximos: configuracion.EQUIPOS_FOTO_KB_MAXIMOS * 1024,
                ladoMaximo: configuracion.EQUIPOS_FOTO_LADO_MAXIMO,
              },
              // D2 (15-L) · el puerto RTSP, del `.env`.
              puertoRtsp: configuracion.VIDEO_PUERTO_RTSP,
              // R2 (15-N) · el reloj del equipo, antes de dar de alta con vigencia.
              desvioDeRelojMaximoS: configuracion.EQUIPOS_DESVIO_DE_RELOJ_S,
              // 15-P · los bytes del audio con el equipo, según el transporte de la guardia.
              audioDelEquipo:
                configuracion.GUARDIA_AUDIO_TRANSPORTE === 'websocket' ? 'persistente' : 'fetch',
              ...(registro === undefined ? {} : { registro }),
              ...(opciones.semilla === undefined ? {} : { semilla: opciones.semilla }),
            });
          },
        },
        ...alias,
      ],
      exports: [
        PROVEEDOR_DE_EQUIPOS,
        PROVEEDOR_DIRECTO,
        FUENTE_DE_PLACAS,
        TUNELES_DE_EDGE,
        RUTAS_DE_EQUIPOS,
        ACCESS_POINT_PROVIDER,
        PLATE_EVENT_SOURCE,
        FACE_TEMPLATE_PROVIDER,
        INTERCOM_PROVIDER,
      ],
    };
  }
}

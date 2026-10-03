import { Module } from '@nestjs/common';
import {
  REGISTRO_DE_EVENTOS_DE_EQUIPO,
  REPOSITORIO_EVENTOS,
  REPOSITORIO_EVENTOS_DE_EQUIPO,
} from '../eventos';
import type {
  RegistroDeEventosDeEquipo,
  RepositorioEventos,
  RepositorioEventosDeEquipo,
} from '../eventos';
import { AtencionController } from './presentacion/atencion.controller';
import { ConsultarColaDeAtencion, FUENTE_DE_LA_COLA } from './aplicacion/consultar-cola';
import type { FuenteDeLaCola } from './aplicacion/consultar-cola';
import { PREFERENCIAS_DE_ATENCION } from './aplicacion/preferencias-de-atencion';
import type { RepositorioDePreferenciasDeAtencion } from './aplicacion/preferencias-de-atencion';
import { FuenteDeLaColaPorPuertos } from './infraestructura/fuente-de-la-cola';
import {
  PreferenciasDeAtencionEnMemoria,
  PreferenciasDeAtencionPg,
} from './infraestructura/preferencias-de-atencion-pg';
import { ConstanciaDeOrdenesEnLineaDeTiempo } from './infraestructura/constancia-de-ordenes';
import { EquiposModule, PuntosDeOperacion } from '../equipos';
import { PUNTOS_DEL_EQUIPO } from './aplicacion/puntos-del-equipo';
import type { PuntosDelEquipo } from './aplicacion/puntos-del-equipo';
import type { DynamicModule } from '@nestjs/common';
import { BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { GuardiaController } from './presentacion/guardia.controller';
import { VideoController } from './presentacion/video.controller';
import { crearControlDeBarreraDesdeEntorno } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';
import { PROVEEDOR_DE_EQUIPOS } from '../proveedores';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import {
  AccionarPuertaAMano,
  ACCIONADOR_DE_PUERTA,
  BITACORA_DE_ORDENES,
  BLOQUEO_DE_ACCESO,
} from './aplicacion/apertura-manual';
import type {
  AccionadorDePuerta,
  BitacoraDeOrdenes,
  BloqueoDeAcceso,
} from './aplicacion/apertura-manual';
import { FijarBloqueoDeAcceso, REGISTRO_DE_BLOQUEOS } from './aplicacion/bloqueo-de-acceso';
import type { RegistroDeBloqueos } from './aplicacion/bloqueo-de-acceso';
import { CANAL_DE_INTERCOM, PUENTE_DE_VIDEO } from './aplicacion/puertos';
import type { PuenteDeVideo } from './aplicacion/puertos';
import { PuenteGo2rtc } from './infraestructura/puente-go2rtc';
import { CanalIntercomEnProceso } from './infraestructura/canal-intercom-en-proceso';
import { BitacoraDeOrdenesEnMemoria } from './infraestructura/adaptadores-en-memoria';
import { PROVEEDOR_DE_REGISTRO_DE_BLOQUEOS } from './infraestructura/composicion-de-bloqueos';
import { PROVEEDOR_DE_AVISO_AL_RESIDENTE } from './infraestructura/composicion-del-aviso';
import { AccionadorPorProveedor } from './infraestructura/accionador-por-proveedor';
import { BitacoraDeOrdenesPg } from './infraestructura/bitacora-de-ordenes-pg';
import { Pool } from 'pg';
import { CanalIntercomConTransporte } from './infraestructura/canal-intercom-con-transporte';
import { anunciarAccionador } from './infraestructura/aviso-de-arranque-del-accionador';
import { REGISTRO_DE_CONVERSACIONES } from './aplicacion/conversacion-de-audio';
import { ConversacionesEnMemoria, ConversacionesPg } from './infraestructura/conversaciones-pg';
import { AudioController } from './presentacion/audio/audio.controller';
import { BilletesDeAudio } from './presentacion/audio/billetes-de-audio';
import { PuertaDeAudioPorWebSocket } from './presentacion/audio/puerta-de-audio';
import { PROVEEDOR_DE_VISTA_EN_VIVO } from './infraestructura/puente-de-video-por-el-edge';
import { PROVEEDOR_DE_SERVIDORES_ICE } from './infraestructura/servidores-ice-de-configuracion';
import { IceController } from './presentacion/ice.controller';

/**
 * Consolas operativas — ETAPA 10. **Va después de `EventosModule`** (`@Global`:
 * repositorio de eventos, escalamiento y aviso al residente). La cola de
 * atención lee de ahí: dos listas de lo mismo se separan.
 *
 * Desde la 15-E los dos puertos de hardware de esta consola —accionar y
 * hablar— van por el PROVEEDOR DE EQUIPOS (A1): la apertura resuelve por
 * `AccessPointProvider` y el intercom abre el del aparato por `IntercomProvider`
 * cuando el turno se concede. Con el simulado, lo de siempre (ADR-03); con el
 * real, los equipos de la consola. La exclusividad sigue en el dominio.
 */
@Module({})
export class GuardiaModule {
  private static unico: DynamicModule | undefined; // 15-U · Nest 11 deduplica por referencia
  static registrar(): DynamicModule {
    return (GuardiaModule.unico ??= {
      module: GuardiaModule,
      // 15-L · el alcance de equipos (el equipo es de la copropiedad de la ruta).
      imports: [EquiposModule.registrar()],
      controllers: [
        GuardiaController,
        VideoController,
        IceController,
        AtencionController,
        AudioController,
      ],
      providers: [
        /**
         * G1 · G2 (15-N) · la cola de atención (P-22) y las preferencias de la
         * copropiedad. La fuente son los tres puertos que ya existen —accesos,
         * eventos de equipo, órdenes—: con base o en memoria es la misma.
         */
        {
          provide: FUENTE_DE_LA_COLA,
          inject: [REPOSITORIO_EVENTOS, REPOSITORIO_EVENTOS_DE_EQUIPO, BITACORA_DE_ORDENES],
          useFactory: (
            eventos: RepositorioEventos,
            deEquipos: RepositorioEventosDeEquipo,
            ordenes: BitacoraDeOrdenes,
          ) => new FuenteDeLaColaPorPuertos(eventos, deEquipos, ordenes),
        },
        {
          provide: PREFERENCIAS_DE_ATENCION,
          inject: [CONFIGURACION, Pool],
          useFactory: (configuracion: Configuracion, pool: Pool) =>
            configuracion.PERSISTENCIA_DE_EVENTOS === 'postgres'
              ? new PreferenciasDeAtencionPg(pool)
              : new PreferenciasDeAtencionEnMemoria(),
        },
        {
          provide: ConsultarColaDeAtencion,
          inject: [FUENTE_DE_LA_COLA, PREFERENCIAS_DE_ATENCION, RELOJ, CONFIGURACION],
          useFactory: (
            fuente: FuenteDeLaCola,
            preferencias: RepositorioDePreferenciasDeAtencion,
            reloj: Reloj,
            configuracion: Configuracion,
          ) =>
            new ConsultarColaDeAtencion(
              fuente,
              preferencias,
              reloj,
              configuracion.GUARDIA_VIGENCIA_EN_COLA_S,
            ),
        },
        {
          /**
           * A1 · la apertura de CUALQUIER dispositivo pasa por el proveedor
           * de equipos, resuelto por dispositivo contra el registro y decidido
           * por capacidades. `BARRERA_*` sigue como COMPATIBILIDAD DECLARADA:
           * es el único control VERIFICADO contra el equipo, y si nombra un
           * dispositivo, ese va por él. Los dos caminos se anuncian al arrancar
           * y cada orden anota cuál la atendió (O5).
           *
           * Quién construye el control de barrera es el paquete de
           * proveedores, no este módulo, y es deliberado: si la API leyera la
           * dirección del equipo tendría que nombrarla, y el vocabulario del
           * fabricante no sale de `packages/providers` (KPI-11).
           */
          provide: ACCIONADOR_DE_PUERTA,
          inject: [BITACORA, PROVEEDOR_DE_EQUIPOS, CONFIGURACION],
          useFactory: (
            bitacora: Bitacora,
            proveedor: ProveedorDeEquipos,
            configuracion: Configuracion,
          ) => {
            const control = crearControlDeBarreraDesdeEntorno();
            const dispositivoDeEntorno = (process.env['BARRERA_DISPOSITIVO_ID'] ?? '').trim();
            anunciarAccionador(bitacora, {
              clase: configuracion.PROVEEDOR_DE_EQUIPOS,
              hayControlDeEntorno: control !== null,
              dispositivoDeEntorno,
            });
            return new AccionadorPorProveedor(
              proveedor,
              configuracion.PROVEEDOR_DE_EQUIPOS,
              bitacora,
              control !== null && dispositivoDeEntorno !== ''
                ? { control, dispositivoId: dispositivoDeEntorno }
                : null,
            );
          },
        },
        {
          // El mismo objeto atiende los dos puertos: es un aparato, no dos.
          provide: BLOQUEO_DE_ACCESO,
          inject: [ACCIONADOR_DE_PUERTA],
          useFactory: (accionador: AccionadorDePuerta & BloqueoDeAcceso) => accionador,
        },
        {
          /**
           * D-139 (15-E) · el historial de órdenes manuales (RN-08) va a la
           * base con el interruptor del histórico; en memoria sólo para la
           * suite y para ensayar sin base, y el arranque lo dice.
           */
          provide: BITACORA_DE_ORDENES,
          inject: [CONFIGURACION, Pool, BITACORA],
          useFactory: (configuracion: Configuracion, pool: Pool, bitacora: Bitacora) => {
            const enBase = configuracion.PERSISTENCIA_DE_EVENTOS === 'postgres';
            bitacora.registrar(
              enBase ? 'info' : 'aviso',
              `bitácora de órdenes manuales activa: ${configuracion.PERSISTENCIA_DE_EVENTOS}`,
              {
                persistencia: configuracion.PERSISTENCIA_DE_EVENTOS,
                consecuencia: enBase
                  ? 'las órdenes de portería y guardia quedan en ordenes_manuales'
                  : 'las órdenes viven en este proceso y se PIERDEN al reiniciar',
              },
            );
            return enBase ? new BitacoraDeOrdenesPg(pool) : new BitacoraDeOrdenesEnMemoria();
          },
        },
        PROVEEDOR_DE_REGISTRO_DE_BLOQUEOS,
        PROVEEDOR_DE_AVISO_AL_RESIDENTE, // 15-R · DT-15N-02
        {
          provide: FijarBloqueoDeAcceso,
          inject: [BLOQUEO_DE_ACCESO, REGISTRO_DE_BLOQUEOS, RELOJ],
          useFactory: (barrera: BloqueoDeAcceso, registro: RegistroDeBloqueos, reloj: Reloj) =>
            new FijarBloqueoDeAcceso(barrera, registro, reloj),
        },
        {
          /**
           * A1 · el canal de intercom reparte turnos EN PROCESO (la máquina de
           * estados del dominio) y, cuando concede uno, abre el canal del
           * aparato por `INTERCOM_PROVIDER`. El transporte lo decide la
           * capacidad `audioBidireccional` del equipo, no la clase del
           * proveedor (ADR-019): el simulado con un identificador que no
           * conoce sigue repartiendo turnos sin audio, y lo dice.
           */
          provide: CANAL_DE_INTERCOM,
          inject: [RELOJ, PROVEEDOR_DE_EQUIPOS, BITACORA, CONFIGURACION],
          useFactory: (
            reloj: Reloj,
            proveedor: ProveedorDeEquipos,
            bitacora: Bitacora,
            configuracion: Configuracion,
          ) =>
            new CanalIntercomConTransporte(
              new CanalIntercomEnProceso(reloj),
              proveedor,
              bitacora,
              configuracion.GUARDIA_AUDIO_TRANSPORTE,
            ),
        },
        /**
         * 15-P · P2 · el audio por WebSocket (ADR-01, enmienda 15-P): billetes
         * de un solo uso, la puerta de la actualización y la constancia de cada
         * conversación (en la base con el histórico; si no, en el proceso).
         */
        { provide: BilletesDeAudio, useFactory: () => new BilletesDeAudio() },
        {
          provide: REGISTRO_DE_CONVERSACIONES,
          inject: [CONFIGURACION, Pool],
          useFactory: (configuracion: Configuracion, pool: Pool) =>
            configuracion.PERSISTENCIA_DE_EVENTOS === 'postgres'
              ? new ConversacionesPg(pool)
              : new ConversacionesEnMemoria(),
        },
        PuertaDeAudioPorWebSocket,
        {
          provide: PUENTE_DE_VIDEO,
          inject: [CONFIGURACION, BITACORA],
          useFactory: (configuracion: Configuracion, bitacora: Bitacora): PuenteDeVideo | null => {
            const url = configuracion.GO2RTC_URL;
            bitacora.registrar(
              url === undefined ? 'aviso' : 'info',
              url === undefined
                ? 'vista en vivo SIN puente: GO2RTC_URL no está; el WHEP responde 503'
                : 'vista en vivo con puente go2rtc configurado (RTSP → WebRTC por la API)',
              { configurado: url !== undefined },
            );
            return url === undefined ? null : new PuenteGo2rtc(url);
          },
        },
        // 15-Q2 · E2 · STUN/TURN de la consola, y la vista en vivo POR COPROPIEDAD (R1).
        PROVEEDOR_DE_SERVIDORES_ICE,
        PROVEEDOR_DE_VISTA_EN_VIVO,
        {
          /**
           * 15-P · P3 · la puerta del punto elegido, resuelta por el módulo de
           * equipos (dueño de `puntos_de_acceso`) con la identidad de quien
           * ordena: la RLS y el alcance deciden qué puntos existen para él.
           */
          provide: PUNTOS_DEL_EQUIPO,
          inject: [PuntosDeOperacion],
          useFactory: (operacion: PuntosDeOperacion): PuntosDelEquipo => ({
            resolver: async (ctx, copropiedadId, dispositivoId, puntoId) => {
              const p = await operacion.resolver(ctx, copropiedadId, dispositivoId, puntoId);
              return p === null
                ? null
                : { id: p.id, nombre: p.nombre, numeroDePuerta: p.numeroDePuerta };
            },
          }),
        },
        {
          provide: AccionarPuertaAMano,
          inject: [
            ACCIONADOR_DE_PUERTA,
            BITACORA_DE_ORDENES,
            RELOJ,
            GENERADOR_DE_ID,
            REGISTRO_DE_EVENTOS_DE_EQUIPO,
            BITACORA,
            PUNTOS_DEL_EQUIPO,
          ],
          useFactory: (
            accionador: AccionadorDePuerta,
            ordenes: BitacoraDeOrdenes,
            reloj: Reloj,
            ids: GeneradorDeId,
            eventosDeEquipo: RegistroDeEventosDeEquipo,
            bitacora: Bitacora,
            puntos: PuntosDelEquipo,
          ) =>
            new AccionarPuertaAMano(
              accionador,
              ordenes,
              reloj,
              ids,
              // A1 (15-L) · la orden, con su desenlace, en la línea de tiempo.
              new ConstanciaDeOrdenesEnLineaDeTiempo(eventosDeEquipo, bitacora),
              puntos,
            ),
        },
      ],
      exports: [CANAL_DE_INTERCOM, BITACORA_DE_ORDENES, REGISTRO_DE_BLOQUEOS],
    });
  }
}

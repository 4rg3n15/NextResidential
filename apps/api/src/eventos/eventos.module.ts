import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ALMACEN_EVIDENCIA, BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { AlmacenEvidencia, Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import {
  CargadorDeContextoConservador,
  DecidirAcceso,
  RESOLUTOR_DE_ZONA,
  VersionDeReglasFija,
} from '../autorizaciones';
import type { ResolutorDeZona } from '../autorizaciones';
import {
  CANAL_TIEMPO_REAL,
  MOTOR_DE_DECISION,
  NOTIFICADOR_PUSH,
  REPOSITORIO_ALERTAS,
  REPOSITORIO_DISPOSITIVOS,
  REPOSITORIO_EVENTOS,
} from './aplicacion/puertos';
import type {
  CanalTiempoReal,
  MotorDeDecision,
  NotificadorPush,
  RepositorioAlertas,
  RepositorioDispositivos,
  RepositorioEventos,
} from './aplicacion/puertos';
import { EscalarAlerta } from './aplicacion/escalamiento';
import { RegistrarAcceso } from './aplicacion/registrar-acceso';
import {
  ConsultarEventos,
  ExportarEventos,
  ObtenerEvidencia,
} from './aplicacion/consultar-eventos';
import { VigilarLatidos } from './aplicacion/vigilancia-latidos';
import { CanalEnProceso } from './infraestructura/canal-en-proceso';
import {
  AlmacenEvidenciaFirmado,
  NotificadorPushRegistrado,
} from './infraestructura/evidencia-y-push';
import {
  RepositorioAlertasEnMemoria,
  RepositorioDispositivosEnMemoria,
  RepositorioEventosEnMemoria,
} from './infraestructura/repositorios-en-memoria';
import { EventosController } from './presentacion/eventos.controller';
import { InformesController } from './presentacion/informes.controller';
import { AlertasController } from './presentacion/alertas.controller';

/**
 * Raíz de composición del módulo de eventos.
 *
 * Es el ÚNICO sitio donde el módulo de eventos nombra al de autorizaciones, y lo
 * hace por su barril (§2.2). La capa de aplicación habla con `MotorDeDecision`,
 * su propio puerto, y no sabe que detrás hay un `DecidirAcceso`: eso es lo que
 * permitirá que la ETAPA 12 ponga ahí la decisión local del Edge.
 *
 * **Por qué los adaptadores son los de memoria.** Sin contraseña de PostgreSQL
 * (D-17) la API no puede conectarse en tiempo de ejecución. `RepositorioEventosPg`
 * existe, implementa el mismo puerto y se prueba contra una base real en
 * `test/eventos-pg.test.ts`; lo que se elige aquí es qué se cablea, no qué se
 * construyó. Cuando llegue la credencial, cambia esta fábrica y nada más.
 *
 * `@Global` por una razón concreta y no por comodidad: el canal de tiempo real
 * es **una sola instancia** por proceso. Dos instancias serían dos conjuntos de
 * suscriptores, y las alertas publicadas en una no llegarían a los conectados a
 * la otra — un fallo que no daría error, solo silencio.
 */
@Global()
@Module({})
export class EventosModule {
  static registrar(): DynamicModule {
    return {
      module: EventosModule,
      controllers: [EventosController, AlertasController, InformesController],
      providers: [
        { provide: REPOSITORIO_EVENTOS, useFactory: () => new RepositorioEventosEnMemoria() },
        { provide: REPOSITORIO_ALERTAS, useFactory: () => new RepositorioAlertasEnMemoria() },
        {
          provide: REPOSITORIO_DISPOSITIVOS,
          useFactory: () => new RepositorioDispositivosEnMemoria(),
        },
        {
          provide: CanalEnProceso,
          inject: [BITACORA],
          useFactory: (bitacora: Bitacora) => new CanalEnProceso(bitacora),
        },
        { provide: CANAL_TIEMPO_REAL, useExisting: CanalEnProceso },
        {
          provide: NOTIFICADOR_PUSH,
          inject: [BITACORA],
          useFactory: (bitacora: Bitacora) => new NotificadorPushRegistrado(bitacora),
        },
        {
          provide: ALMACEN_EVIDENCIA,
          inject: [CONFIGURACION],
          useFactory: (c: Configuracion) => new AlmacenEvidenciaFirmado(c.INGESTA_FIRMA_SECRETO),
        },
        {
          provide: MOTOR_DE_DECISION,
          // ETAPA 07 · el resolutor de zona entra aquí, así que una solicitud
          // que nombre una zona llega al motor con su horario y su aforo ya
          // resueltos (CU-05). El motor sigue sin consultar nada.
          inject: [RELOJ, BITACORA, RESOLUTOR_DE_ZONA],
          useFactory: (
            reloj: Reloj,
            bitacora: Bitacora,
            zonas: ResolutorDeZona,
          ): MotorDeDecision => {
            const cargador = new CargadorDeContextoConservador(
              new VersionDeReglasFija(),
              bitacora,
              zonas,
            );
            const decidir = new DecidirAcceso(cargador, reloj);
            return { decidir: (solicitud) => decidir.ejecutar(solicitud) };
          },
        },
        {
          provide: EscalarAlerta,
          inject: [CANAL_TIEMPO_REAL, REPOSITORIO_ALERTAS, RELOJ, BITACORA, NOTIFICADOR_PUSH],
          useFactory: (
            canal: CanalTiempoReal,
            alertas: RepositorioAlertas,
            reloj: Reloj,
            bitacora: Bitacora,
            push: NotificadorPush,
          ) => new EscalarAlerta(canal, alertas, reloj, bitacora, push),
        },
        {
          provide: RegistrarAcceso,
          inject: [
            MOTOR_DE_DECISION,
            REPOSITORIO_EVENTOS,
            REPOSITORIO_ALERTAS,
            CANAL_TIEMPO_REAL,
            EscalarAlerta,
            RELOJ,
            GENERADOR_DE_ID,
            BITACORA,
            NOTIFICADOR_PUSH,
          ],
          useFactory: (
            motor: MotorDeDecision,
            eventos: RepositorioEventos,
            alertas: RepositorioAlertas,
            canal: CanalTiempoReal,
            escalador: EscalarAlerta,
            reloj: Reloj,
            ids: GeneradorDeId,
            bitacora: Bitacora,
            push: NotificadorPush,
          ) =>
            new RegistrarAcceso(
              motor,
              eventos,
              alertas,
              canal,
              escalador,
              reloj,
              ids,
              bitacora,
              push,
            ),
        },
        {
          provide: ConsultarEventos,
          inject: [REPOSITORIO_EVENTOS],
          useFactory: (repo: RepositorioEventos) => new ConsultarEventos(repo),
        },
        {
          provide: ExportarEventos,
          inject: [REPOSITORIO_EVENTOS],
          useFactory: (repo: RepositorioEventos) => new ExportarEventos(repo),
        },
        {
          provide: ObtenerEvidencia,
          inject: [REPOSITORIO_EVENTOS, ALMACEN_EVIDENCIA],
          useFactory: (repo: RepositorioEventos, almacen: AlmacenEvidencia) =>
            new ObtenerEvidencia(repo, almacen),
        },
        {
          provide: VigilarLatidos,
          inject: [
            REPOSITORIO_DISPOSITIVOS,
            REPOSITORIO_ALERTAS,
            EscalarAlerta,
            RELOJ,
            GENERADOR_DE_ID,
            BITACORA,
          ],
          useFactory: (
            dispositivos: RepositorioDispositivos,
            alertas: RepositorioAlertas,
            escalador: EscalarAlerta,
            reloj: Reloj,
            ids: GeneradorDeId,
            bitacora: Bitacora,
          ) => new VigilarLatidos(dispositivos, alertas, escalador, reloj, ids, bitacora),
        },
      ],
      exports: [
        REPOSITORIO_EVENTOS,
        REPOSITORIO_ALERTAS,
        REPOSITORIO_DISPOSITIVOS,
        CANAL_TIEMPO_REAL,
        CanalEnProceso,
        RegistrarAcceso,
        VigilarLatidos,
        EscalarAlerta,
      ],
    };
  }
}

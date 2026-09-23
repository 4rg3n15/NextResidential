import { Global, Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { ALMACEN_EVIDENCIA, BITACORA, GENERADOR_DE_ID, RELOJ } from '@ncr/domain-core';
import type { AlmacenEvidencia, Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { Pool } from 'pg';
import {
  CargadorDeContextoConservador,
  CargadorDeContextoPg,
  DecidirAcceso,
  REPOSITORIO_AUTORIZACIONES,
  RESOLUTOR_DE_PLACA,
  RESOLUTOR_DE_ZONA,
  RepositorioListaNegraPg,
  VersionDeReglasFija,
} from '../autorizaciones';
import type {
  CargadorDeContexto,
  RepositorioAutorizaciones,
  ResolutorDePlaca,
  ResolutorDeZona,
} from '../autorizaciones';
import { REPOSITORIO_COPROPIEDADES } from '../multiempresa/repositorio-copropiedades';
import type { RepositorioCopropiedades } from '../multiempresa/repositorio-copropiedades';
import {
  CANAL_TIEMPO_REAL,
  MOTOR_DE_DECISION,
  NOTIFICADOR_PUSH,
  ESCALAMIENTO_DE_ALERTA,
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
import { AlmacenEvidenciaSupabase } from './infraestructura/evidencia-supabase';
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
import { METRICAS } from '../observabilidad';
import type { Metricas } from '../observabilidad';

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
          /**
           * ETAPA 09-B · el bucket real cuando está declarado, y el de memoria
           * sólo cuando no lo está.
           *
           * **La elección se hace por configuración y se DICE en la bitácora.**
           * Un adaptador de memoria que entra en silencio es el peor de los dos
           * mundos: el sistema funciona en las pruebas y pierde la evidencia al
           * reiniciar, sin que nadie vea la diferencia. Con el aviso, un
           * despliegue mal configurado se lee en la primera línea del arranque
           * —además de en la comprobación de recursos externos—.
           */
          inject: [CONFIGURACION, BITACORA],
          useFactory: (c: Configuracion, bitacora: Bitacora): AlmacenEvidencia => {
            if (c.EVIDENCIA_BUCKET === undefined) {
              bitacora.registrar(
                'aviso',
                'evidencia EN MEMORIA: se pierde al reiniciar el proceso',
                {
                  motivo: 'EVIDENCIA_BUCKET no está declarada',
                  remedio: 'docs/guias/CONEXION_SUPABASE.md §7.1',
                },
              );
              return new AlmacenEvidenciaFirmado(c.INGESTA_FIRMA_SECRETO);
            }
            return new AlmacenEvidenciaSupabase({
              supabaseUrl: c.SUPABASE_URL,
              llaveSecreta: c.SUPABASE_SECRET_KEY,
              bucket: c.EVIDENCIA_BUCKET,
              bitacora,
            });
          },
        },
        {
          provide: MOTOR_DE_DECISION,
          // ETAPA 07 · el resolutor de zona entra aquí, así que una solicitud
          // que nombre una zona llega al motor con su horario y su aforo ya
          // resueltos (CU-05). El motor sigue sin consultar nada.
          /**
           * ETAPA 09-B · entra la LISTA NEGRA. Hasta aquí el motor recibía dos
           * conjuntos vacíos y RN-06 —precedencia absoluta sobre cualquier
           * autorización vigente— no tenía de dónde leer. El `Pool` es el
           * global de `PoolModule` (D-66), así que esto no abre conexiones
           * nuevas.
           */
          /**
           * ═══════════════════════════════════════════════════════════════════
           * D-25 · ETAPA 15-D · LOS DOS CARGADORES CONVIVEN, Y EL ARRANQUE DICE CUÁL
           *
           * Hasta aquí se construía SIEMPRE el conservador, y el conservador
           * devuelve un contexto vacío: toda lectura acababa en FALLO_TECNICO
           * aunque la consola hubiera escrito la autorización. El camino de
           * escritura existía; el de lectura, no.
           *
           * El conservador NO se borra: es el comportamiento correcto cuando
           * no hay origen de datos, y sus pruebas lo demuestran. Lo elige la
           * configuración, y la línea de abajo deja escrito cuál quedó activo
           * — que hoy nadie lo supiera era la mitad del defecto.
           */
          inject: [
            RELOJ,
            BITACORA,
            RESOLUTOR_DE_ZONA,
            Pool,
            CONFIGURACION,
            REPOSITORIO_AUTORIZACIONES,
            RESOLUTOR_DE_PLACA,
            REPOSITORIO_COPROPIEDADES,
          ],
          useFactory: (
            reloj: Reloj,
            bitacora: Bitacora,
            zonas: ResolutorDeZona,
            pool: Pool,
            config: Configuracion,
            autorizaciones: RepositorioAutorizaciones,
            placas: ResolutorDePlaca,
            copropiedades: RepositorioCopropiedades,
          ): MotorDeDecision => {
            const listaNegra = new RepositorioListaNegraPg(pool);
            const cargador: CargadorDeContexto =
              config.CARGADOR_DE_CONTEXTO === 'postgres'
                ? new CargadorDeContextoPg(
                    new VersionDeReglasFija(),
                    autorizaciones,
                    placas,
                    listaNegra,
                    copropiedades,
                    bitacora,
                    zonas,
                  )
                : new CargadorDeContextoConservador(
                    new VersionDeReglasFija(),
                    bitacora,
                    zonas,
                    listaNegra,
                  );
            bitacora.registrar(
              config.CARGADOR_DE_CONTEXTO === 'postgres' ? 'info' : 'aviso',
              `cargador de contexto del motor activo: ${config.CARGADOR_DE_CONTEXTO}`,
              {
                cargador: config.CARGADOR_DE_CONTEXTO,
                consecuencia:
                  config.CARGADOR_DE_CONTEXTO === 'postgres'
                    ? 'las autorizaciones, el padrón y la lista negra llegan al motor desde la base'
                    : 'el motor no lee nada y deniega toda lectura por FALLO_TECNICO (D-25)',
              },
            );
            const decidir = new DecidirAcceso(cargador, reloj);
            return { decidir: (solicitud) => decidir.ejecutar(solicitud) };
          },
        },
        {
          provide: EscalarAlerta,
          inject: [
            CANAL_TIEMPO_REAL,
            REPOSITORIO_ALERTAS,
            RELOJ,
            BITACORA,
            NOTIFICADOR_PUSH,
            // ETAPA 14 · opcional: este módulo se monta en bancos de prueba que
            // no registran la observabilidad, y KPI-25 no puede ser el motivo
            // de que un escalamiento no se pueda construir.
            { token: METRICAS, optional: true },
          ],
          useFactory: (
            canal: CanalTiempoReal,
            alertas: RepositorioAlertas,
            reloj: Reloj,
            bitacora: Bitacora,
            push: NotificadorPush,
            metricas?: Metricas,
          ) => new EscalarAlerta(canal, alertas, reloj, bitacora, push, metricas),
        },
        // Mismo objeto, publicado bajo el puerto que consumen otros módulos.
        { provide: ESCALAMIENTO_DE_ALERTA, useExisting: EscalarAlerta },
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
        /**
         * Sale desde la ETAPA 15: el receptor del «servidor de alarma» guarda
         * la fotografía de la lectura por este mismo puerto. Exportarlo —en
         * vez de que aquel módulo componga su propio almacén— es lo que
         * garantiza que la evidencia de una apertura por placa y la de
         * cualquier otro evento acaben en el MISMO bucket con la MISMA
         * política de firma (RN-21).
         */
        ALMACEN_EVIDENCIA,
        REPOSITORIO_ALERTAS,
        REPOSITORIO_DISPOSITIVOS,
        CANAL_TIEMPO_REAL,
        CanalEnProceso,
        RegistrarAcceso,
        VigilarLatidos,
        EscalarAlerta,
        ESCALAMIENTO_DE_ALERTA,
      ],
    };
  }
}

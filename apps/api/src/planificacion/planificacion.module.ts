import { Injectable, Module } from '@nestjs/common';
import type { DynamicModule, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { Inject } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ModuleRef } from '@nestjs/core';
import { Pool } from 'pg';
import { BITACORA } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { VigilarLatidos } from '../eventos';
import { ReiniciarAforosVencidos } from '../zonas';
import { BarrerPlantillasVencidas } from '../biometria';
import { CATALOGO_DE_COPROPIEDADES, PLANIFICADOR } from './aplicacion/puertos';
import type {
  CatalogoDeCopropiedades,
  Planificador,
  TrabajoProgramado,
} from './aplicacion/puertos';
import { HORARIOS, trabajoPorCopropiedad } from './aplicacion/trabajos';
import { PlanificadorPgBoss } from './infraestructura/planificador-pgboss';
import { PlanificadorInerte } from './infraestructura/planificador-inerte';
import { CatalogoDeCopropiedadesPg } from './infraestructura/catalogo-copropiedades-pg';

/**
 * Identidad del planificador en las columnas de auditoría.
 *
 * Es el **actor de sistema** que la migración `0025` crea de forma idempotente
 * (`app.actor_de_sistema()`), el mismo que figura como autor de las filas de
 * arranque. No se inventa un UUID nuevo: `usuarios.actualizado_por` tiene clave
 * ajena hacia `usuarios`, así que un identificador sintético haría fallar cada
 * escritura del barrido con una violación de integridad — y el barrido de
 * plantillas tiene un plazo legal detrás (RN-11).
 *
 * Que las filas tocadas por un trabajo programado lleven este actor y no el de
 * una persona es lo correcto: KPI-05 pide saber quién cambió qué, y la
 * respuesta honesta aquí es «el sistema, sin intervención humana».
 */
export const ACTOR_DEL_PLANIFICADOR = '00000000-0000-4000-8000-000000000001';

/**
 * Arranca y detiene el planificador con el ciclo de vida de la aplicación.
 *
 * `OnApplicationBootstrap` y no el constructor: en el constructor los demás
 * proveedores pueden no estar resueltos todavía, y un trabajo que se dispara
 * antes de tiempo encontraría repositorios a medio construir.
 */
@Injectable()
export class CicloDelPlanificador implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(PLANIFICADOR) private readonly planificador: Planificador,
    @Inject(CATALOGO_DE_COPROPIEDADES) private readonly catalogo: CatalogoDeCopropiedades,
    @Inject(BITACORA) private readonly bitacora: Bitacora,
    private readonly referencia: ModuleRef,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * LOS TRES CASOS DE USO SE RESUELVEN CON `ModuleRef` Y NO POR INYECCIÓN.
     *
     * No es comodidad: es la única forma correcta aquí. Los tres viven en
     * módulos distintos —eventos, zonas y biometría— y cada uno se registra con
     * `Module.registrar()`, es decir, como módulo DINÁMICO. Importarlos desde
     * aquí volvería a invocar esas fábricas y crearía una SEGUNDA instancia de
     * cada repositorio: el planificador barrería un almacén y las rutas otro,
     * y las pruebas seguirían en verde porque cada una mira el suyo. Es la
     * misma familia de defecto que persigue este proyecto, con dos objetos en
     * vez de uno.
     *
     * `strict: false` busca en TODO el contenedor, que es donde `app.module.ts`
     * ya registró las instancias únicas. La frontera de §2.2 se respeta igual:
     * los tres se importan por el BARRIL de su módulo, no por una ruta interna.
     */
    const latidos = this.referencia.get(VigilarLatidos, { strict: false });
    const aforos = this.referencia.get(ReiniciarAforosVencidos, { strict: false });
    const plantillas = this.referencia.get(BarrerPlantillasVencidas, { strict: false });

    for (const trabajo of trabajosDeMantenimiento(
      { latidos, aforos, plantillas },
      this.catalogo,
      this.bitacora,
    )) {
      this.planificador.programar(trabajo);
    }

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * NO SE ESPERA, Y NO PUEDE TUMBAR EL ARRANQUE.
     *
     * `onApplicationBootstrap` corre DENTRO de `app.listen()`: esperar aquí a
     * que pg-boss abra su conexión retrasa la apertura del puerto, y si esa
     * conexión falla, **la API no arranca en absoluto**.
     *
     * No es una hipótesis: el paso 12c del verificador levantó la API con una
     * `DATABASE_URL` de marcador y el proceso murió con
     * «Fallo al arrancar la API: getaddrinfo ENOTFOUND base» tras haber
     * mapeado todas sus rutas. Una cola caída dejaba sin portería a una
     * copropiedad entera.
     *
     * Es exactamente la decisión que `main.ts` ya había tomado para los
     * recursos externos —comprobarlos DESPUÉS de `listen`, «si se hiciera
     * antes, un endpoint lento retrasaría la apertura del puerto y el
     * orquestador daría el despliegue por muerto»— aplicada aquí.
     *
     * El fallo NO se traga: se registra como `error` con su motivo, porque un
     * planificador que no arrancó significa que RN-11 no se está cumpliendo y
     * eso tiene que verse en el registro del arranque.
     */
    void this.planificador.arrancar().catch((error: unknown) => {
      this.bitacora.registrar(
        'error',
        'el planificador NO arrancó: los barridos no se ejecutarán',
        {
          error: error instanceof Error ? error.message : String(error),
          consecuencia:
            'RN-11 (supresión de plantillas en 24 h), CA-26 (terminal caída) y el reinicio ' +
            'de aforos quedan sin ejecutar hasta que el planificador arranque',
        },
      );
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.planificador.detener();
  }
}

export interface CasosDeUsoDeMantenimiento {
  readonly latidos: VigilarLatidos;
  readonly aforos: ReiniciarAforosVencidos;
  readonly plantillas: BarrerPlantillasVencidas;
}

/**
 * Los tres trabajos, como función pura sobre sus casos de uso: así la prueba
 * los construye con dobles y comprueba el parte sin montar Nest.
 */
export const trabajosDeMantenimiento = (
  casos: CasosDeUsoDeMantenimiento,
  catalogo: CatalogoDeCopropiedades,
  bitacora: Bitacora,
): readonly TrabajoProgramado[] => [
  trabajoPorCopropiedad(
    {
      nombre: 'ncr.vigilar-latidos',
      cron: HORARIOS.latidos,
      descripcion:
        'D-31 · marca caída la terminal que dejó de latir y abre su alerta (CA-26). ' +
        'Un dispositivo caído no genera ningún evento: ese es el problema',
      ejecutar: async (copropiedadId) => {
        const parte = await casos.latidos.ejecutar(copropiedadId, ACTOR_DEL_PLANIFICADOR);
        return {
          revisados: parte.revisados,
          caidos: parte.caidos.length,
          degradados: parte.degradados.length,
          alertas: parte.alertasAbiertas,
        };
      },
    },
    catalogo,
    bitacora,
  ),
  trabajoPorCopropiedad(
    {
      nombre: 'ncr.reiniciar-aforos',
      cron: HORARIOS.aforos,
      descripcion:
        'D-36 · persiste el reinicio por cierre de jornada en las zonas que nadie toca, ' +
        'que hasta ahora conservaban el conteo antiguo indefinidamente',
      ejecutar: async (copropiedadId) => {
        const parte = await casos.aforos.ejecutar(copropiedadId);
        return { zonas: parte.zonas, reiniciadas: parte.reiniciadas };
      },
    },
    catalogo,
    bitacora,
  ),
  trabajoPorCopropiedad(
    {
      nombre: 'ncr.barrer-plantillas',
      cron: HORARIOS.plantillas,
      descripcion:
        'D-40 · suprime la plantilla biométrica vencida y la retira de la terminal dentro ' +
        'de las 24 h que exige RN-11. Hasta ahora se invocaba a mano',
      ejecutar: async (copropiedadId) => {
        const r = await casos.plantillas.ejecutar({
          usuarioId: ACTOR_DEL_PLANIFICADOR,
          rol: 'servicio',
          copropiedadId,
          copropiedadesAtendidas: [copropiedadId],
          mfaVerificado: true,
        });
        return r.ok
          ? {
              suprimidas: r.valor.suprimidas,
              retiradas: r.valor.retiradas,
              retiradasFallidas: r.valor.retiradasFallidas,
            }
          : { suprimidas: 0, retiradas: 0, retiradasFallidas: 0 };
      },
    },
    catalogo,
    bitacora,
  ),
];

export interface OpcionesPlanificacion {
  /** Sin cadena, no hay planificador: se registra el motivo y no se ejecuta. */
  readonly cadenaDeConexion?: string;
  readonly esquema: string;
  readonly habilitado: boolean;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL MÓDULO QUE INVOCA LO QUE NADIE INVOCABA (D-31, D-36, D-40)
 *
 * Las tres operaciones son idempotentes desde su etapa y estaban probadas. Lo
 * único que faltaba era quién las llamara, y eso es lo que hay aquí.
 *
 * VA EL ÚLTIMO en `app.module.ts`, después de eventos, zonas y biometría: toma
 * un caso de uso de cada uno por sus barriles (§2.2), y un módulo no puede
 * inyectar lo que todavía no se ha registrado.
 */
@Module({})
export class PlanificacionModule {
  static registrar(opciones: OpcionesPlanificacion): DynamicModule {
    return {
      module: PlanificacionModule,
      providers: [
        {
          provide: CATALOGO_DE_COPROPIEDADES,
          inject: [Pool],
          useFactory: (pool: Pool): CatalogoDeCopropiedades => new CatalogoDeCopropiedadesPg(pool),
        },
        {
          provide: PLANIFICADOR,
          inject: [BITACORA],
          useFactory: (bitacora: Bitacora): Planificador =>
            opciones.habilitado && opciones.cadenaDeConexion !== undefined
              ? new PlanificadorPgBoss({
                  cadenaDeConexion: opciones.cadenaDeConexion,
                  esquema: opciones.esquema,
                  bitacora,
                })
              : new PlanificadorInerte(
                  bitacora,
                  opciones.habilitado === false
                    ? 'PLANIFICADOR_HABILITADO=false'
                    : 'sin DATABASE_URL para pg-boss',
                ),
        },
        CicloDelPlanificador,
      ],
      exports: [PLANIFICADOR, CATALOGO_DE_COPROPIEDADES],
    };
  }
}

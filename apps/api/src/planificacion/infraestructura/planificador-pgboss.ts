import PgBoss from 'pg-boss';
import type { Bitacora } from '@ncr/domain-core';
import type { Planificador, TrabajoProgramado } from '../aplicacion/puertos';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLANIFICADOR SOBRE pg-boss · §2.6 («colas y trabajos programados: pg-boss
 * sobre el mismo PostgreSQL»)
 *
 * POR QUÉ pg-boss Y NO UN `setInterval`. Un temporizador en el proceso parece
 * suficiente hasta que hay dos instancias de API: entonces el barrido de
 * plantillas corre dos veces y la vigilancia de latidos abre dos alertas por el
 * mismo equipo. pg-boss toma el **cerrojo en PostgreSQL** —la misma base que ya
 * está ahí— y solo una instancia ejecuta cada disparo. Es la razón por la que
 * el stack lo fijó: una pieza menos que operar y una garantía que un
 * temporizador no puede dar.
 *
 * `schedule()` es IDEMPOTENTE por nombre: volver a llamarlo con el mismo nombre
 * reemplaza el horario en vez de añadir un segundo. Por eso `arrancar()` se
 * puede invocar dos veces sin duplicar nada, y por eso el nombre del trabajo es
 * una clave y no una etiqueta.
 *
 * EL ESQUEMA VA APARTE (`PGBOSS_SCHEMA`). No lleva `copropiedad_id` y sus
 * tablas no tienen políticas RLS: es infraestructura de cola, no dato de
 * negocio (`modelo-datos.md` §8.5). El aislamiento lo sostiene la capa de
 * aplicación, que recibe la copropiedad explícita en cada trabajo.
 *
 * LO QUE ESTE ADAPTADOR NO HACE, y conviene que no lo haga: ni reintentos
 * infinitos ni colas de trabajo de negocio. Aquí solo viven los tres barridos
 * de mantenimiento. Una cola de negocio —encolar la sincronización de una
 * plantilla, por ejemplo— es otra decisión y necesita su propio puerto.
 */
export interface OpcionesPlanificador {
  readonly cadenaDeConexion: string;
  readonly esquema: string;
  readonly bitacora: Bitacora;
  /** Zona horaria de las expresiones cron. UTC a propósito: ver abajo. */
  readonly zonaHoraria?: string;
}

/**
 * UTC y no la zona de la copropiedad. Los horarios de estos tres trabajos son
 * frecuencias («cada cinco minutos», «cada hora»), no citas con una hora local,
 * así que el cambio de horario de verano no los afecta. Lo que SÍ es local es
 * el cierre de jornada de una zona, y eso lo decide el dominio con la zona
 * horaria de la copropiedad dentro del objeto de valor — no el planificador.
 */
const ZONA_POR_OMISION = 'UTC';

export class PlanificadorPgBoss implements Planificador {
  private readonly trabajos: TrabajoProgramado[] = [];
  private boss: PgBoss | null = null;

  constructor(private readonly opciones: OpcionesPlanificador) {}

  get programados(): readonly TrabajoProgramado[] {
    return this.trabajos;
  }

  programar(trabajo: TrabajoProgramado): void {
    this.trabajos.push(trabajo);
  }

  async arrancar(): Promise<void> {
    if (this.boss !== null) return;
    const boss = new PgBoss({
      connectionString: this.opciones.cadenaDeConexion,
      schema: this.opciones.esquema,
      // El planificador no necesita concurrencia: son tres barridos por hora.
      // Un pool pequeño evita competir por conexiones con el tráfico real, que
      // comparte el tope del proyecto Supabase (D-66).
      max: 2,
    });
    boss.on('error', (error: unknown) => {
      this.opciones.bitacora.registrar('error', 'pg-boss', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    await boss.start();
    this.boss = boss;

    for (const trabajo of this.trabajos) {
      await boss.createQueue(trabajo.nombre);
      await boss.work(trabajo.nombre, async () => {
        const inicio = Date.now();
        try {
          const parte = await trabajo.ejecutar();
          this.opciones.bitacora.registrar('info', 'trabajo programado ejecutado', {
            trabajo: trabajo.nombre,
            duracionMs: Date.now() - inicio,
            ...parte,
          });
        } catch (error) {
          // Se registra y se relanza: pg-boss tiene que ver el fallo para
          // aplicar su política de reintento. Tragárselo aquí dejaría el
          // trabajo «correcto» para siempre.
          this.opciones.bitacora.registrar('error', 'trabajo programado fallido', {
            trabajo: trabajo.nombre,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      });
      await boss.schedule(trabajo.nombre, trabajo.cron, undefined, {
        tz: this.opciones.zonaHoraria ?? ZONA_POR_OMISION,
      });
      this.opciones.bitacora.registrar('info', 'trabajo programado dado de alta', {
        trabajo: trabajo.nombre,
        cron: trabajo.cron,
        descripcion: trabajo.descripcion,
      });
    }
  }

  async detener(): Promise<void> {
    const boss = this.boss;
    this.boss = null;
    if (boss !== null) await boss.stop({ graceful: true });
  }
}

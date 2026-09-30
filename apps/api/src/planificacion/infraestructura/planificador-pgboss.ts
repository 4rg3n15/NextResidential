import PgBoss from 'pg-boss';
import type { Bitacora } from '@ncr/domain-core';
import { categoriaDeFallo, motivoSinSecretos } from '../../persistencia/con-cliente';
import type {
  ColaAPedido,
  EstadoDelPlanificador,
  Planificador,
  TrabajoAPedido,
  TrabajoProgramado,
} from '../aplicacion/puertos';

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
  /**
   * 15-O · conexiones del pool PROPIO de pg-boss. Cuenta en el presupuesto del
   * pooler de Supabase junto con `PG_POOL_MAX` (`PGBOSS_POOL_MAX`).
   */
  readonly maximoDeConexiones?: number;
  /** 15-O · esperas entre reintentos de arranque. Inyectables para la prueba. */
  readonly reintento?: { readonly primeraEsperaMs: number; readonly esperaMaximaMs: number };
}

/** 15-O · el nombre con el que pg-boss se presenta a PostgreSQL (`pg_stat_activity`). */
export const NOMBRE_DE_APLICACION_DE_PGBOSS = 'ncr-pgboss';

/**
 * 15-O · si pg-boss no arranca, se reintenta solo: 5 s, 10 s, 20 s… hasta cinco
 * minutos entre intentos. Antes un fallo al arrancar lo dejaba parado hasta el
 * siguiente reinicio de la API, y sólo lo decía una línea del arranque.
 */
export const REINTENTO_DE_ARRANQUE = { primeraEsperaMs: 5_000, esperaMaximaMs: 300_000 } as const;

/**
 * UTC y no la zona de la copropiedad. Los horarios de estos tres trabajos son
 * frecuencias («cada cinco minutos», «cada hora»), no citas con una hora local,
 * así que el cambio de horario de verano no los afecta. Lo que SÍ es local es
 * el cierre de jornada de una zona, y eso lo decide el dominio con la zona
 * horaria de la copropiedad dentro del objeto de valor — no el planificador.
 */
const ZONA_POR_OMISION = 'UTC';

/** Otros fallos (15-M) · plazo de un barrido en curso al apagar; menor que `PLAZO_DE_CIERRE_MS`. */
export const PLAZO_DE_PARADA_MS = 6_000;

export class PlanificadorPgBoss implements Planificador, ColaAPedido {
  private readonly trabajos: TrabajoProgramado[] = [];
  private readonly aPedido: TrabajoAPedido[] = [];
  private boss: PgBoss | null = null;
  private situacion: EstadoDelPlanificador = { fase: 'detenido' };
  private ultimoError: EstadoDelPlanificador['ultimoError'];
  private intentos = 0;
  private siguienteIntento: NodeJS.Timeout | undefined;
  private parado = false;

  constructor(private readonly opciones: OpcionesPlanificador) {}

  /** 15-O · la fase, y el último error del motor aunque siga en marcha. */
  estado(): EstadoDelPlanificador {
    return this.ultimoError === undefined
      ? this.situacion
      : { ...this.situacion, ultimoError: this.ultimoError };
  }

  get programados(): readonly TrabajoProgramado[] {
    return this.trabajos;
  }

  programar(trabajo: TrabajoProgramado): void {
    this.trabajos.push(trabajo);
  }

  /**
   * 15-O · un intento; si falla, deja programado el siguiente y RELANZA para
   * que el arranque lo registre. `/ready` publica `reintentando` con el motivo
   * hasta que uno salga bien.
   */
  async arrancar(): Promise<void> {
    if (
      this.boss !== null ||
      this.siguienteIntento !== undefined ||
      this.situacion.fase === 'arrancando'
    ) {
      return;
    }
    this.parado = false;
    try {
      await this.intentar();
    } catch (error) {
      this.programarReintento(error);
      throw error;
    }
  }

  private programarReintento(error: unknown): void {
    if (this.parado) return;
    const { primeraEsperaMs, esperaMaximaMs } = this.opciones.reintento ?? REINTENTO_DE_ARRANQUE;
    const esperaMs = Math.min(primeraEsperaMs * 2 ** (this.intentos - 1), esperaMaximaMs);
    const motivo = `${categoriaDeFallo(error)}; intento ${String(this.intentos)}, el siguiente en ${String(Math.round(esperaMs / 1000))} s`;
    this.situacion = { fase: 'reintentando', motivo };
    this.siguienteIntento = setTimeout(() => {
      this.siguienteIntento = undefined;
      if (this.parado) return;
      this.intentar().then(
        () => {
          this.opciones.bitacora.registrar('info', 'el planificador arrancó tras reintentar', {
            intentos: this.intentos,
          });
        },
        (otro: unknown) => {
          this.opciones.bitacora.registrar('error', 'el planificador sigue sin arrancar', {
            error: motivoSinSecretos(otro),
            intentos: this.intentos,
          });
          this.programarReintento(otro);
        },
      );
    }, esperaMs);
    // No retiene el proceso: un cierre ordenado no espera al próximo intento.
    this.siguienteIntento.unref();
  }

  private async intentar(): Promise<void> {
    this.intentos += 1;
    this.situacion = { fase: 'arrancando' };
    const boss = new PgBoss({
      connectionString: this.opciones.cadenaDeConexion,
      schema: this.opciones.esquema,
      // El planificador no necesita concurrencia: son tres barridos por hora.
      // Un pool pequeño evita competir por conexiones con el tráfico real, que
      // comparte el tope del proyecto Supabase (D-66, 15-O).
      max: this.opciones.maximoDeConexiones ?? 2,
      application_name: NOMBRE_DE_APLICACION_DE_PGBOSS,
    });
    /**
     * 15-O · el `'error'` de pg-boss reúne el de su pool (una conexión ociosa
     * que la base cortó), el de sus bucles de mantenimiento y el de los
     * trabajos. Ninguno lo detiene: sus bucles capturan y siguen, y su pool
     * abre otra conexión en la siguiente consulta. Se registra y se publica
     * en `/ready`; no se calla.
     */
    boss.on('error', (error: unknown) => {
      const cola =
        error !== null && typeof error === 'object'
          ? (error as { queue?: unknown }).queue
          : undefined;
      this.ultimoError = {
        momento: new Date(),
        categoria:
          typeof cola === 'string'
            ? `falló un trabajo de la cola ${cola}`
            : categoriaDeFallo(error),
      };
      this.opciones.bitacora.registrar('error', 'pg-boss', {
        error:
          error instanceof Error
            ? motivoSinSecretos(error)
            : motivoSinSecretos(String((error as { message?: unknown }).message ?? error)),
      });
    });
    try {
      await boss.start();
      await this.darDeAlta(boss);
    } catch (error) {
      // Lo que llegó a abrir se cierra: sin esto cada intento fallido dejaría
      // conexiones colgando contra el mismo tope que lo hizo fallar.
      await boss.stop({ graceful: false, timeout: 1_000 }).catch(() => undefined);
      throw error;
    }
    this.boss = boss;
    this.situacion = { fase: 'en-marcha' };
  }

  private async darDeAlta(boss: PgBoss): Promise<void> {
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
    await this.atenderColas(boss);
  }

  /** R1 (15-N) · quien atiende una cola a pedido. Antes de `arrancar`. */
  atender(trabajo: TrabajoAPedido): void {
    this.aPedido.push(trabajo);
  }

  async encolar(
    nombre: string,
    datos: Readonly<Record<string, string>>,
    clave?: string,
  ): Promise<boolean> {
    const boss = this.boss;
    if (boss === null) return false;
    await boss.send(nombre, { ...datos }, clave === undefined ? {} : { singletonKey: clave });
    return true;
  }

  /** Las colas a pedido, con su trabajador. Sin horario: se encolan desde la aplicación. */
  private async atenderColas(boss: PgBoss): Promise<void> {
    for (const trabajo of this.aPedido) {
      await boss.createQueue(trabajo.nombre);
      await boss.work<Readonly<Record<string, string>>>(trabajo.nombre, async (lote) => {
        for (const job of lote) {
          const inicio = Date.now();
          try {
            const parte = await trabajo.ejecutar(job.data);
            this.opciones.bitacora.registrar('info', 'trabajo a pedido ejecutado', {
              trabajo: trabajo.nombre,
              duracionMs: Date.now() - inicio,
              ...parte,
            });
          } catch (error) {
            this.opciones.bitacora.registrar('error', 'trabajo a pedido fallido', {
              trabajo: trabajo.nombre,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        }
      });
      this.opciones.bitacora.registrar('info', 'cola a pedido atendida', {
        trabajo: trabajo.nombre,
        descripcion: trabajo.descripcion,
      });
    }
  }

  async detener(): Promise<void> {
    const boss = this.boss;
    this.boss = null;
    this.parado = true;
    clearTimeout(this.siguienteIntento);
    this.siguienteIntento = undefined;
    this.situacion = { fase: 'detenido' };
    // Otros fallos (15-M) · un barrido en curso tiene este plazo para terminar;
    // si no, pg-boss lo marca fallido y se repite en la próxima pasada (son
    // idempotentes). Cabe dentro del plazo del cierre ordenado. [SUPUESTO] S-157.
    if (boss !== null) await boss.stop({ graceful: true, timeout: PLAZO_DE_PARADA_MS });
  }
}

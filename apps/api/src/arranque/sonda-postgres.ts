import type { Pool } from 'pg';
import { categoriaDeFallo, conCliente, saludDe } from '../persistencia/con-cliente';
import type { SaludDeConexiones } from '../persistencia/con-cliente';
import type { RecursoExterno, ResultadoDeRecurso } from './recursos-externos';

export const SONDA_POSTGRES = Symbol.for('ncr.SondaDePostgres');

/**
 * Lo que `/ready` publica de la base. `clase` distingue la base que no contesta
 * del pool que está entero ocupado: se arreglan en sitios distintos (el panel de
 * Supabase o la red, frente a `PG_POOL_MAX` o la carga).
 */
export interface ResultadoDeLaBase extends ResultadoDeRecurso {
  readonly clase?: 'agotado' | 'no-disponible';
  /** El último corte que vio el pool, aunque ya se haya repuesto. */
  readonly ultimoCorte?: NonNullable<SaludDeConexiones['ultimoCorte']>;
}

export interface SondaDePostgres {
  comprobar(): Promise<ResultadoDeLaBase>;
}

/** 15-O · lo que la sonda espera una conexión antes de declarar la base no disponible. */
export const ESPERA_DE_LA_SONDA_MS = 2000;

/**
 * `SELECT 1` por EL POOL DE LA API.
 *
 * **Por qué hace falta.** `/ready` publicaba `postgres: 'no-conectado-etapa-04'`
 * —una cadena FIJA, escrita cinco etapas atrás y nunca revisada— y aun así
 * respondía 200. Es la misma familia que el JWKS: una sonda que no sonda.
 *
 * **15-O · por el pool de la API, ya no por uno propio.** Hasta aquí la sonda
 * abría su conexión aparte: respondía «la base contesta» con el pool de la API
 * roto o agotado, que es justo lo que pasó en sitio —y además gastaba un
 * cliente del pooler de Supabase, que en el plan gratuito son quince—. Ahora
 * mira el pool que atiende las peticiones, sin quedarse en su cola:
 *
 *  · si todas sus conexiones están ocupadas y hay peticiones esperando, dice
 *    `agotado` SIN pedir otra (no espera en la cola que vigila);
 *  · si no, pide una con `conCliente` y un tope de dos segundos: si no llega,
 *    para efectos de admitir tráfico la base no está.
 *
 * El detalle es la CLASE del fallo (`categoriaDeFallo`), nunca el texto de
 * `pg`, que puede llevar el host: `/ready` es pública.
 */
export class SondaDePostgresPg implements SondaDePostgres {
  constructor(
    private readonly pool: Pool,
    private readonly maximo: number,
    private readonly esperaMs = ESPERA_DE_LA_SONDA_MS,
  ) {}

  async comprobar(): Promise<ResultadoDeLaBase> {
    const corte = saludDe(this.pool).ultimoCorte;
    const conCorte = corte === null ? {} : { ultimoCorte: corte };
    const { totalCount, idleCount, waitingCount } = this.pool;
    if (totalCount >= this.maximo && idleCount === 0 && waitingCount > 0) {
      return {
        estado: 'roto',
        clase: 'agotado',
        detalle:
          `las ${String(this.maximo)} conexiones del pool están ocupadas y ` +
          `${String(waitingCount)} petición(es) esperan una`,
        remedio:
          'revisa qué la está saturando (un volcado de eventos, una carga masiva) y el ' +
          'presupuesto de conexiones (PG_POOL_MAX, SUPABASE_POOLER_MAX_CLIENTES)',
        ...conCorte,
      };
    }
    let plazo: NodeJS.Timeout | undefined;
    try {
      const uno = await Promise.race([
        conCliente(
          this.pool,
          async (c) => (await c.query<{ uno: number }>('SELECT 1 AS uno')).rows,
        ),
        new Promise<never>((_, rechazar) => {
          plazo = setTimeout(
            () => rechazar(new Error(`timeout de la sonda (${String(this.esperaMs)} ms)`)),
            this.esperaMs,
          );
        }),
      ]);
      return uno[0]?.uno === 1
        ? { estado: 'ok', detalle: 'SELECT 1 respondió por el pool de la API', ...conCorte }
        : {
            estado: 'roto',
            clase: 'no-disponible',
            detalle: 'la consulta respondió algo inesperado',
            ...conCorte,
          };
    } catch (e) {
      return {
        estado: 'roto',
        clase: 'no-disponible',
        detalle: categoriaDeFallo(e),
        remedio: 'revisa DATABASE_POOLER_URL y que el proyecto Supabase esté activo',
        ...conCorte,
      };
    } finally {
      clearTimeout(plazo);
    }
  }
}

export const recursoBaseDeDatos = (sonda: SondaDePostgres): RecursoExterno => ({
  nombre: 'PostgreSQL (pooler)',
  critico: true,
  comprobar: () => sonda.comprobar(),
});

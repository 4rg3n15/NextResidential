import { Pool } from 'pg';
import type { RecursoExterno, ResultadoDeRecurso } from './recursos-externos';

export const SONDA_POSTGRES = Symbol.for('ncr.SondaDePostgres');

export interface SondaDePostgres {
  comprobar(): Promise<ResultadoDeRecurso>;
}

/**
 * `SELECT 1` contra la base real.
 *
 * **Por qué hace falta.** `/ready` publicaba `postgres: 'no-conectado-etapa-04'`
 * —una cadena FIJA, escrita cinco etapas atrás y nunca revisada— y aun así
 * respondía 200. Es la misma familia que el JWKS: una sonda que no sonda.
 * Peor todavía, la etiqueta afirmaba algo falso: desde la ETAPA 04 hay
 * repositorios PostgreSQL en cinco módulos, así que la API sí depende de la
 * base, y `/ready` decía «listo» sin haberla tocado nunca.
 *
 * **Pool propio, de una conexión.** No se reutiliza el de los repositorios
 * porque cada módulo crea el suyo y ninguno lo exporta; y aunque lo exportara,
 * una sonda que compite por las conexiones del tráfico real puede quedarse
 * esperando y declarar caída una base que solo está ocupada. `max: 1` y un
 * tiempo de conexión corto: si no contesta en dos segundos, para efectos de
 * admitir tráfico no está.
 */
export class SondaDePostgresPg implements SondaDePostgres {
  private pool: Pool | null = null;

  constructor(private readonly cadena: string) {}

  private obtener(): Pool {
    this.pool ??= new Pool({
      connectionString: this.cadena,
      max: 1,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 10_000,
    });
    return this.pool;
  }

  async comprobar(): Promise<ResultadoDeRecurso> {
    try {
      const { rows } = await this.obtener().query<{ uno: number }>('SELECT 1 AS uno');
      return rows[0]?.uno === 1
        ? { estado: 'ok', detalle: 'SELECT 1 respondió' }
        : { estado: 'roto', detalle: 'la consulta respondió algo inesperado' };
    } catch (e) {
      return {
        estado: 'roto',
        // El mensaje de `pg` no lleva la contraseña —va en la cadena, no en el
        // error— pero sí puede llevar el host. Se recorta a la clase del fallo.
        detalle: e instanceof Error ? e.name : 'error desconocido',
        remedio: 'revisa DATABASE_POOLER_URL y que el proyecto Supabase esté activo',
      };
    }
  }
}

export const recursoBaseDeDatos = (sonda: SondaDePostgres): RecursoExterno => ({
  nombre: 'PostgreSQL (pooler)',
  critico: true,
  comprobar: () => sonda.comprobar(),
});

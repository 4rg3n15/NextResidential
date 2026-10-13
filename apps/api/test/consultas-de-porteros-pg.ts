import type { Pool } from 'pg';

/**
 * Las lecturas de la base que usa `porteros-por-identificador-pg`, fuera del
 * fichero (15-S5): pasaba de 300 líneas y la corrección de DT-15M-C01 no podía
 * hacerlo crecer. Leen con el superusuario de la base de pruebas.
 */
export const consultasDePorteros = (pool: () => Pool) => ({
  poolDe: async (cop: string) =>
    (
      await pool().query<{ numero: number; inicio: number; fin: number; siguiente: number }>(
        'SELECT numero, inicio, fin, siguiente FROM public.pools_de_porteros WHERE copropiedad_id = $1',
        [cop],
      )
    ).rows[0],

  rechazosDeIp: async (usuarioId: string, ip: string) =>
    (
      await pool().query<{ recurso: string; resultado: string }>(
        `SELECT recurso, resultado FROM public.auditoria_seguridad
          WHERE tipo = 'restriccion_de_ip' AND usuario_id = $1 AND host(ip) = $2
          ORDER BY ocurrido_en`,
        [usuarioId, ip],
      )
    ).rows,

  /**
   * 15-S5 · DT-15M-C01 · entre dos altas seguidas, ¿el número avanza y cada
   * número de en medio es el pool de OTRA copropiedad que existe? Sin nadie en
   * medio equivale a «b = a + 1»; con otra suite dando altas a la vez, también
   * vale, y un número perdido por la secuencia sigue saliendo como hueco.
   */
  huecosEntre: async (a: number, b: number) => {
    const { rows } = await pool().query<{ n: number }>(
      'SELECT count(*)::int AS n FROM public.pools_de_porteros WHERE numero > $1 AND numero < $2',
      [a, b],
    );
    return { avanza: b > a, huecos: b - a - 1 - (rows[0]?.n ?? 0) };
  },
});

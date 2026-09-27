import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';

/**
 * Claims de servicio POR COPROPIEDAD en cada llamada, como la biometría: el
 * aislamiento de aplicación (`exigirAlcance`, el segundo camino de §2.7.6) ya
 * ocurrió en el controlador, y cada consulta filtra además por
 * `copropiedad_id` explícito — un parámetro, nunca una concatenación.
 */
export const conServicio = async <T>(
  pool: Pool,
  copropiedadId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> => {
  const cliente = await pool.connect();
  try {
    await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claimsDeServicio(copropiedadId)),
    ]);
    return await fn(cliente);
  } finally {
    cliente.release();
  }
};

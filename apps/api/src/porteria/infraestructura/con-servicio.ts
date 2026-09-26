import type { Pool, PoolClient } from 'pg';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';

/**
 * Una transacción con los claims de SERVICIO de UNA copropiedad y el actor
 * real en `usuario_id`, para que `actualizado_por` diga quién fue. La política
 * de las tablas de portería admite al servicio sólo sobre su copropiedad; la
 * decisión de quién puede —superadministrador, el propio portero— ya la tomó
 * la capa de aplicación (§2.7.6, segundo camino).
 */
export const conServicio = async <T>(
  pool: Pool,
  copropiedadId: string,
  actorId: string | null,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({
        rol: 'servicio',
        usuario_id: actorId ?? ACTOR_INGESTA,
        copropiedad_id: copropiedadId,
        copropiedades: [copropiedadId],
      }),
    ]);
    const r = await fn(cliente);
    await cliente.query('COMMIT');
    return r;
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
};

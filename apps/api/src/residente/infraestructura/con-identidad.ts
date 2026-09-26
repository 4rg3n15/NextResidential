import type { Pool, PoolClient } from 'pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CON QUÉ IDENTIDAD ESCRIBE LA API EL HOGAR DEL RESIDENTE · ETAPA 15-I
 *
 * Dos, y nunca la del residente:
 *
 *  · SERVICIO de su copropiedad, con el residente como actor en `usuario_id`.
 *    Es lo que admiten las políticas de las tablas de la 0038 y lo que los
 *    disparadores reconocen: el del tope (que vigila al rol `residente` por la
 *    REST), el de las plazas (el servicio no cambia el número tras declarar) y
 *    el de los campos propios de `usuarios` (el servicio sí fija `persona_id`).
 *  · PLATAFORMA para lo que hace el superadministrador (añadir y quitar plazas):
 *    el disparador de las plazas sólo se lo permite a él.
 *
 * En los dos casos la decisión de QUIÉN puede ya la tomó la aplicación —roles
 * por guarda, `exigirAlcance`, el ámbito resuelto desde la identidad—; la base
 * es la segunda barrera (§2.7.6). Todo va en una transacción: el rastro en la
 * bitácora cae con el cambio o no cae.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const enTransaccion = async <T>(
  pool: Pool,
  claims: Record<string, unknown>,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> => {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
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

export const comoServicio = <T>(
  pool: Pool,
  copropiedadId: string,
  actorId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> =>
  enTransaccion(
    pool,
    {
      rol: 'servicio',
      usuario_id: actorId,
      copropiedad_id: copropiedadId,
      copropiedades: [copropiedadId],
    },
    fn,
  );

export const comoPlataforma = <T>(
  pool: Pool,
  actorId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> =>
  enTransaccion(
    pool,
    { rol: 'superadministrador', usuario_id: actorId, copropiedad_id: null, copropiedades: [] },
    fn,
  );

/** Para deshacer SIN lanzar: la transacción termina en ROLLBACK y el valor sale. */
export class Deshacer<T> extends Error {
  constructor(readonly valor: T) {
    super('deshacer');
  }
}

export const deshaciendo = async <T>(trabajo: () => Promise<T>): Promise<T> => {
  try {
    return await trabajo();
  } catch (e) {
    if (e instanceof Deshacer) return e.valor as T;
    throw e;
  }
};

/** El SQLSTATE y la restricción de un error de `pg`, sin `any`. */
export const violacion = (e: unknown): { codigo?: string; restriccion?: string } => {
  const x = e as { code?: unknown; constraint?: unknown };
  return {
    ...(typeof x.code === 'string' ? { codigo: x.code } : {}),
    ...(typeof x.constraint === 'string' ? { restriccion: x.constraint } : {}),
  };
};

import type { Pool, PoolClient } from 'pg';

/**
 * Lo único que comparten los adaptadores del residente: cómo abrir la conexión.
 *
 * Se extrae aquí cuando 11-B añadió el tercero. Con dos era discutible; con
 * cuatro copias de la misma apertura, la quinta es la que se olvida de fijar
 * los claims — y fijarlos es lo que mantiene a la RLS como segunda barrera
 * (§2.7.6). Un detalle de conexión repetido cuatro veces deja de ser un detalle.
 *
 * NO contiene ninguna consulta ni ninguna regla: la herencia aquí es de
 * mecánica, no de comportamiento, y por eso no viola la preferencia de §2.4 por
 * la composición — no hay dos adaptadores que se sustituyan entre sí.
 */
export abstract class BaseDelResidentePg {
  constructor(
    protected readonly pool: Pool,
    protected readonly claims: Record<string, unknown> = {},
  ) {}

  protected async conContexto<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claims),
      ]);
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }

  /**
   * Igual que `conContexto`, pero dentro de una transacción.
   *
   * Crear una autorización toca cuatro tablas —persona, visitante,
   * autorización, acompañantes y zonas—. Sin transacción, un fallo a mitad deja
   * un visitante sin autorización y un acompañante sin nadie a quien acompañar:
   * basura que nadie limpia y que el portero ve.
   */
  protected async enTransaccion<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return this.conContexto(async (c) => {
      await c.query('BEGIN');
      try {
        const r = await fn(c);
        await c.query('COMMIT');
        return r;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    });
  }
}

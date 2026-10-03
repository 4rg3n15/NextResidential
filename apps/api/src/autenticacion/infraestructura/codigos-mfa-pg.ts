import type { Pool, PoolClient } from 'pg';
import type { RepositorioCodigosMfa } from '../aplicacion/puertos';
import { conCliente } from '../../persistencia/con-cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS CÓDIGOS DE RECUPERACIÓN, EN LA BASE · 15-R, bloque A1 (RN-20, CA-25)
 *
 * El adaptador en memoria los perdía en cada reinicio: quien perdió el teléfono
 * se quedaba sin salida justo el día que la necesitaba. La tabla existía desde
 * la 0026 y nadie escribía en ella.
 *
 * Con qué identidad. La tabla NO tiene política para el propio usuario —ni el
 * dueño lee sus hashes; una política así convertiría un XSS en un robo de
 * códigos (0026)—, sólo para el superadministrador. La API actúa con esos
 * claims y un actor explícito, igual que `repositorio-cuentas-pg.ts` con las
 * cuentas; quién es el usuario lo decidió ya el controlador, que sólo toca los
 * códigos de quien llama.
 *
 * Un solo uso lo decide la BASE: `consumir` es un único `UPDATE … WHERE
 * consumido_en IS NULL AND retirado_en IS NULL`; de dos peticiones simultáneas
 * con el mismo código, una cambia una fila y la otra ninguna. Sólo hashes.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const comoAdministracion = (actorId: string): string =>
  JSON.stringify({
    rol: 'superadministrador',
    usuario_id: actorId,
    copropiedad_id: null,
    copropiedades: [],
  });

export class RepositorioCodigosMfaPg implements RepositorioCodigosMfa {
  constructor(private readonly pool: Pool) {}

  /** Retira los vigentes y escribe los nuevos, en UNA transacción: o los dos o ninguno. */
  async reemplazar(usuarioId: string, hashes: readonly string[], actorId: string): Promise<void> {
    await this.con(actorId, async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(
          `UPDATE public.codigos_recuperacion_mfa SET retirado_en = now()
            WHERE usuario_id = $1 AND consumido_en IS NULL AND retirado_en IS NULL`,
          [usuarioId],
        );
        await c.query(
          `INSERT INTO public.codigos_recuperacion_mfa (usuario_id, hash, creado_por, actualizado_por)
           SELECT $1, h, $2, $2 FROM unnest($3::text[]) AS h`,
          [usuarioId, actorId, [...hashes]],
        );
        await c.query('COMMIT');
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      }
    });
  }

  async hashesVigentes(usuarioId: string): Promise<readonly string[]> {
    return this.con(usuarioId, async (c) => {
      const { rows } = await c.query<{ hash: string }>(
        `SELECT hash FROM public.codigos_recuperacion_mfa
          WHERE usuario_id = $1 AND consumido_en IS NULL AND retirado_en IS NULL`,
        [usuarioId],
      );
      return rows.map((r) => r.hash);
    });
  }

  async consumir(usuarioId: string, hash: string, ip: string | null): Promise<boolean> {
    return this.con(usuarioId, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE public.codigos_recuperacion_mfa
            SET consumido_en = now(), consumido_desde = $3::inet
          WHERE usuario_id = $1 AND hash = $2
            AND consumido_en IS NULL AND retirado_en IS NULL`,
        [usuarioId, hash, ip],
      );
      return rowCount === 1;
    });
  }

  private async con<T>(actorId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return conCliente(this.pool, async (cliente) => {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        comoAdministracion(actorId),
      ]);
      return await fn(cliente);
    });
  }
}

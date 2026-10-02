import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type { PublicadorDeVersiones, VersionPublicada } from '../aplicacion/puertos';

/**
 * `versiones_de_reglas` (0010) con la identidad de servicio de la copropiedad
 * (0049). La consecutividad la garantiza la base —disparador con candado e
 * índice único (copropiedad_id, numero), ADR-04—, no esta clase: si otra
 * publicación ganó el número, la inserción no entra y se devuelve `false` para
 * que el caso de uso vuelva a leer la última.
 */
const VIOLACION_UNICA = '23505';
const VIOLACION_DE_CHECK = '23514';

export class VersionesPg implements PublicadorDeVersiones {
  constructor(private readonly pool: Pool) {}

  private conServicio<T>(copropiedadId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return conCliente(this.pool, async (c) => {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      return await fn(c);
    });
  }

  async ultima(copropiedadId: string): Promise<VersionPublicada | null> {
    return this.conServicio(copropiedadId, async (c) => {
      // `v.numero` y no `numero`: el ORDER BY prefiere la columna de SALIDA, que es
      // texto, y '9' > '10' dejaría al Edge sin reglas nuevas desde la versión 10.
      const { rows } = await c.query<{ numero: string; hash: string }>(
        `SELECT v.numero::text AS numero, v.hash FROM public.versiones_de_reglas v
          WHERE v.copropiedad_id = $1 ORDER BY v.numero DESC LIMIT 1`,
        [copropiedadId],
      );
      const fila = rows[0];
      return fila === undefined ? null : { numero: Number(fila.numero), hash: fila.hash };
    });
  }

  async publicar(
    copropiedadId: string,
    version: VersionPublicada,
    actorId: string,
  ): Promise<boolean> {
    return this.conServicio(copropiedadId, async (c) => {
      try {
        await c.query(
          `INSERT INTO public.versiones_de_reglas
             (copropiedad_id, numero, hash, publicada_por, creado_por, actualizado_por)
           VALUES ($1, $2, $3, $4, $4, $4)`,
          [copropiedadId, version.numero, version.hash, actorId],
        );
        return true;
      } catch (error) {
        const codigo = (error as { code?: string }).code;
        // Otra publicación ganó ese número (índice) o ya no es el siguiente
        // (disparador): se vuelve a leer, no se insiste con el mismo.
        if (codigo === VIOLACION_UNICA || codigo === VIOLACION_DE_CHECK) return false;
        throw error;
      }
    });
  }
}

import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import type { LatidoDeDispositivo, RepositorioDispositivos } from '../aplicacion/puertos';

/**
 * C4 (ETAPA 15-L) · el latido de cada equipo, en `dispositivos.ultimo_latido`.
 *
 * Hasta la 15-L este puerto sólo existía en memoria y nadie escribía la
 * columna: con PostgreSQL, la consola pintaba TODOS los equipos «Fuera de
 * línea». Se escribe con los claims de SERVICIO de la copropiedad del equipo
 * (la política `dispositivos_edicion` admite `app.es_servicio`), y el filtro
 * de aplicación —`copropiedad_id` en el WHERE— es el segundo camino de §2.7.6.
 *
 * Un latido nunca hace retroceder al anterior (`GREATEST`): si una señal vieja
 * llega tarde, no hace parecer caído a un equipo que acaba de contestar.
 */
export class RepositorioDispositivosPg implements RepositorioDispositivos {
  constructor(private readonly pool: Pool) {}

  async latidos(copropiedadId: string): Promise<readonly LatidoDeDispositivo[]> {
    return this.como(copropiedadId, async (c) => {
      const { rows } = await c.query<{ id: string; ultimo_latido: Date | null }>(
        `SELECT id, ultimo_latido FROM public.dispositivos
          WHERE copropiedad_id = $1 AND estado = 'activo'`,
        [copropiedadId],
      );
      return rows.map((f) => ({
        dispositivoId: f.id,
        copropiedadId,
        ultimoLatido: f.ultimo_latido,
      }));
    });
  }

  async registrarLatido(copropiedadId: string, dispositivoId: string, ahora: Date): Promise<void> {
    await this.como(copropiedadId, (c) =>
      c.query(
        `UPDATE public.dispositivos
            SET ultimo_latido = GREATEST(COALESCE(ultimo_latido, '-infinity'::timestamptz), $3)
          WHERE copropiedad_id = $1 AND id = $2 AND estado = 'activo'`,
        [copropiedadId, dispositivoId, ahora],
      ),
    );
  }

  private async como<T>(copropiedadId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }
}

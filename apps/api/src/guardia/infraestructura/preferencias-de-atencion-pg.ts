import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import type {
  PreferenciasDeAtencion,
  RepositorioDePreferenciasDeAtencion,
} from '../aplicacion/preferencias-de-atencion';

/** G2 (15-N) · las preferencias de atención en `preferencias_de_atencion` (0046). */
export class PreferenciasDeAtencionPg implements RepositorioDePreferenciasDeAtencion {
  constructor(private readonly pool: Pool) {}

  private async conServicio<T>(
    copropiedadId: string,
    fn: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
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

  async leer(copropiedadId: string): Promise<unknown> {
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<{ preferencias: unknown }>(
        'SELECT preferencias FROM public.preferencias_de_atencion WHERE copropiedad_id = $1',
        [copropiedadId],
      );
      return rows[0]?.preferencias ?? null;
    });
  }

  async guardar(
    copropiedadId: string,
    preferencias: PreferenciasDeAtencion,
    actorId: string,
  ): Promise<void> {
    await this.conServicio(copropiedadId, async (c) => {
      await c.query(
        `INSERT INTO public.preferencias_de_atencion
           (copropiedad_id, preferencias, creado_por, actualizado_por)
         VALUES ($1, $2::jsonb, $3, $3)
         ON CONFLICT (copropiedad_id) DO UPDATE
           SET preferencias = EXCLUDED.preferencias,
               actualizado_por = EXCLUDED.actualizado_por,
               actualizado_en = now()`,
        [copropiedadId, JSON.stringify(preferencias), actorId],
      );
    });
  }
}

/** G2 (15-N) · en memoria, para el arranque sin base y las pruebas. */
export class PreferenciasDeAtencionEnMemoria implements RepositorioDePreferenciasDeAtencion {
  private readonly porCopropiedad = new Map<string, PreferenciasDeAtencion>();

  async leer(copropiedadId: string): Promise<unknown> {
    return this.porCopropiedad.get(copropiedadId) ?? null;
  }

  async guardar(copropiedadId: string, preferencias: PreferenciasDeAtencion): Promise<void> {
    this.porCopropiedad.set(copropiedadId, preferencias);
  }
}

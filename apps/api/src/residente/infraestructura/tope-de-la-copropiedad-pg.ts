import type { Pool } from 'pg';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { TopeDePlazasDeLaCopropiedad } from '../aplicacion/tope-de-la-copropiedad';
import { comoPlataforma } from './con-identidad';

/** El tope por omisión contra PostgreSQL (15-W): de plataforma, con su disparador (0056). */
export class TopeDePlazasDeLaCopropiedadPg implements TopeDePlazasDeLaCopropiedad {
  constructor(private readonly pool: Pool) {}

  async leer(copropiedadId: string): Promise<number | null> {
    return comoPlataforma(this.pool, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{ tope: number }>(
        'SELECT tope_de_plazas_por_vivienda::int AS tope FROM public.copropiedades WHERE id = $1',
        [copropiedadId],
      );
      return rows[0]?.tope ?? null;
    });
  }

  async cambiar(copropiedadId: string, tope: number, actorId: string): Promise<boolean> {
    return comoPlataforma(this.pool, actorId, async (c) => {
      const r = await c.query(
        'UPDATE public.copropiedades SET tope_de_plazas_por_vivienda = $2 WHERE id = $1',
        [copropiedadId, tope],
      );
      return (r.rowCount ?? 0) > 0;
    });
  }
}

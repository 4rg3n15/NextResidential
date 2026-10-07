import type { Pool } from 'pg';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { MenorParaElRostro, MenoresParaElRostro } from '../aplicacion/rostro-de-mis-menores';
import { comoServicio } from './con-identidad';
import { SQL_SIN_CUENTA } from './menores-pg';

/**
 * 15-X · D3 · el menor cuyo rostro gestiona el titular, contra PostgreSQL. El
 * `:residenteId` se busca por copropiedad, vivienda del ÁMBITO, activo y sin
 * cuenta, en el propio SQL (como todo lo de los menores, 15-W): el de otra
 * vivienda, el de otra copropiedad o el de un adulto con cuenta no existe para
 * esta ruta, y la aplicación responde 404 sin saber por qué.
 */
export class MenoresParaElRostroPg implements MenoresParaElRostro {
  constructor(private readonly pool: Pool) {}

  async delHogar(
    copropiedadId: string,
    viviendaId: string,
    residenteId: string,
  ): Promise<MenorParaElRostro | null> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<MenorParaElRostro>(
        `SELECT r.persona_id AS "personaId", per.fecha_nacimiento::text AS "fechaNacimiento"
           FROM public.residentes r
           JOIN public.personas per ON per.id = r.persona_id AND per.copropiedad_id = r.copropiedad_id
          WHERE r.id = $3 AND r.copropiedad_id = $1 AND r.vivienda_id = $2 AND r.estado = 'activo'
            AND ${SQL_SIN_CUENTA}`,
        [copropiedadId, viviendaId, residenteId],
      );
      return rows[0] ?? null;
    });
  }
}

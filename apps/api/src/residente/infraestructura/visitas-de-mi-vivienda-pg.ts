import type { Pool } from 'pg';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { SituacionDeMiVisita, VisitasDeMiVivienda } from '../aplicacion/revocar-mi-visita';
import { comoServicio } from './con-identidad';

/**
 * La situación de UNA autorización de la vivienda del residente (15-W, D6). El
 * filtro por vivienda va en el SQL: la del vecino devuelve `null` y la ruta,
 * 404. Vencida = el final de su vigencia ya pasó en el reloj inyectado.
 */
export class VisitasDeMiViviendaPg implements VisitasDeMiVivienda {
  constructor(private readonly pool: Pool) {}

  async situacion(
    copropiedadId: string,
    viviendaId: string,
    autorizacionId: string,
    ahora: Date,
  ): Promise<SituacionDeMiVisita | null> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{ revocada: boolean; vencida: boolean }>(
        `SELECT a.estado = 'revocada' AS revocada,
                (upper(a.vigencia) IS NOT NULL AND upper(a.vigencia) <= $4) AS vencida
           FROM public.autorizaciones a
          WHERE a.copropiedad_id = $1 AND a.vivienda_id = $2 AND a.id = $3`,
        [copropiedadId, viviendaId, autorizacionId, ahora],
      );
      const f = rows[0];
      if (f === undefined) return null;
      if (f.revocada) return 'REVOCADA';
      return f.vencida ? 'VENCIDA' : 'VIGENTE';
    });
  }
}

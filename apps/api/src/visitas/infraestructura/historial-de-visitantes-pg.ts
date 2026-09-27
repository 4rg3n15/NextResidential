import type { Pool } from 'pg';
import type {
  DatosParaRepetir,
  HistorialDeVisitantes,
  VisitanteReciente,
} from '../aplicacion/puertos';
import { conServicio } from './con-servicio';

/**
 * F6 (15-L) · lo que el residente ve de SUS visitantes: los últimos, y los
 * datos para volver a autorizar a uno. Siempre filtrado por la vivienda que
 * pone quien llama, además de la copropiedad.
 */
export class HistorialDeVisitantesPg implements HistorialDeVisitantes {
  constructor(private readonly pool: Pool) {}

  async ultimosDeVivienda(
    copropiedadId: string,
    viviendaId: string,
    limite: number,
  ): Promise<readonly VisitanteReciente[]> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<{
        autorizacion_id: string;
        visitante: string;
        documento: string;
        ultima_visita: Date;
        placa: string | null;
        tiene_foto: boolean;
      }>(
        /*
         * La autorización más reciente de cada persona, y de ellas las
         * `limite` registradas por último. «Últimos» es lo último que se
         * REGISTRÓ, no la visita que empieza más tarde: una visita programada
         * para dentro de un mes no es un visitante reciente. El límite va en
         * la consulta, no en memoria sobre todo el historial de la vivienda.
         */
        `SELECT * FROM (
           SELECT DISTINCT ON (v.persona_id)
                  a.id AS autorizacion_id, p.nombre_completo AS visitante,
                  p.numero_documento AS documento, lower(a.vigencia) AS ultima_visita,
                  a.placa, a.evidencia_foto_id IS NOT NULL AS tiene_foto,
                  a.creado_en
             FROM public.autorizaciones a
             JOIN public.visitantes v ON v.copropiedad_id = a.copropiedad_id AND v.id = a.visitante_id
             JOIN public.personas p ON p.copropiedad_id = v.copropiedad_id AND p.id = v.persona_id
            WHERE a.copropiedad_id = $1 AND a.vivienda_id = $2
            ORDER BY v.persona_id, a.creado_en DESC
         ) recientes
         ORDER BY creado_en DESC
         LIMIT $3`,
        [copropiedadId, viviendaId, limite],
      );
      return rows.map((r) => ({
        autorizacionId: r.autorizacion_id,
        visitante: r.visitante,
        documento: r.documento,
        ultimaVisita: r.ultima_visita,
        placa: r.placa,
        tieneFoto: r.tiene_foto,
      }));
    });
  }

  async paraRepetir(
    copropiedadId: string,
    viviendaId: string,
    autorizacionId: string,
  ): Promise<DatosParaRepetir | null> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<{
        visitante: string;
        documento: string;
        placa: string | null;
        calidad: string | null;
      }>(
        `SELECT p.nombre_completo AS visitante, p.numero_documento AS documento, a.placa,
                (SELECT pb.calidad FROM public.plantillas_biometricas pb
                  WHERE pb.copropiedad_id = a.copropiedad_id AND pb.autorizacion_id = a.id
                  ORDER BY pb.creado_en DESC LIMIT 1) AS calidad
           FROM public.autorizaciones a
           JOIN public.visitantes v ON v.copropiedad_id = a.copropiedad_id AND v.id = a.visitante_id
           JOIN public.personas p ON p.copropiedad_id = v.copropiedad_id AND p.id = v.persona_id
          WHERE a.copropiedad_id = $1 AND a.vivienda_id = $2 AND a.id = $3`,
        [copropiedadId, viviendaId, autorizacionId],
      );
      const fila = rows[0];
      if (fila === undefined) return null;
      return {
        visitante: fila.visitante,
        documento: fila.documento,
        placa: fila.placa,
        calidad: fila.calidad === null ? null : Number(fila.calidad),
      };
    });
  }
}

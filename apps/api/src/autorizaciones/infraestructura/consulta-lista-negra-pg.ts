import type { Pool } from 'pg';
import type { ConsultaDeListaNegra, VetoListado } from '../aplicacion/puertos';

/**
 * 15-I · HU-35 · la lectura de la lista negra para la consola, y el documento
 * de quien se veta resuelto a su persona.
 *
 * Camino de servicio, como `RepositorioListaNegraPg`: la copropiedad la valida
 * la aplicación (§2.7.6) y cada consulta la lleva en su `WHERE`. El documento
 * se compara NORMALIZADO por la misma función de la base con la que se guardó
 * (`app.normalizar_documento`), así que «1.020.304» y «1020304» son el mismo.
 */
export class ConsultaDeListaNegraPg implements ConsultaDeListaNegra {
  constructor(private readonly pool: Pool) {}

  async activas(copropiedadId: string): Promise<readonly VetoListado[]> {
    const { rows } = await this.pool.query<{
      id: string;
      placa: string | null;
      persona_id: string | null;
      persona: string | null;
      documento: string | null;
      motivo: string;
      creado_en: Date;
    }>(
      `SELECT ln.id, ln.placa, ln.persona_id, p.nombre_completo AS persona,
              p.numero_documento AS documento, ln.motivo, ln.creado_en
         FROM public.listas_negras ln
         LEFT JOIN public.personas p
           ON p.id = ln.persona_id AND p.copropiedad_id = ln.copropiedad_id
        WHERE ln.copropiedad_id = $1 AND ln.estado = 'activa'
        ORDER BY ln.creado_en DESC
        LIMIT 500`,
      [copropiedadId],
    );
    return rows.map((f) => ({
      id: f.id,
      placa: f.placa,
      personaId: f.persona_id,
      persona: f.persona,
      documento: f.documento,
      motivo: f.motivo,
      creadoEn: f.creado_en.toISOString(),
    }));
  }

  async personaPorDocumento(copropiedadId: string, documento: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `SELECT id FROM public.personas
        WHERE copropiedad_id = $1
          AND numero_documento = app.normalizar_documento($2)
          AND estado = 'activo'
        LIMIT 2`,
      [copropiedadId, documento],
    );
    // Dos personas con el mismo documento normalizado no deberían existir; si
    // existieran, no se elige una al azar para vetarla.
    return rows.length === 1 ? (rows[0]?.id ?? null) : null;
  }
}

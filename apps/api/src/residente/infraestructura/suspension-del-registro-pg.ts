import type { Pool } from 'pg';
import type { EstadoDelRegistro, SuspensionDelRegistro } from '../aplicacion/puertos-de-suspension';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { comoPlataforma } from './con-identidad';

/**
 * La suspensión del registro contra la bitácora (15-W, §7). Se lee y se reanuda
 * con la identidad de plataforma: sólo el superadministrador llega aquí. La
 * reanudación y su constancia en `auditoria_seguridad` van en una transacción,
 * bajo el mismo bloqueo por copropiedad que los fallos que la provocan.
 */
const SQL_ESTADO = `
  WITH s AS (
    SELECT max(b.ocurrido_en) AS en FROM public.bitacora_de_residentes b
     WHERE b.copropiedad_id = $1 AND b.tipo = 'registro_suspendido_por_intentos'
       AND b.ocurrido_en > $2::timestamptz - interval '1 hour'
       AND NOT EXISTS (SELECT 1 FROM public.bitacora_de_residentes r
                        WHERE r.copropiedad_id = $1 AND r.tipo = 'registro_reanudado'
                          AND r.ocurrido_en > b.ocurrido_en))
  SELECT s.en + interval '1 hour' AS hasta,
         (SELECT count(*)::int FROM public.bitacora_de_residentes f
           WHERE f.copropiedad_id = $1 AND f.tipo = 'registro_codigo_incorrecto'
             AND f.ocurrido_en > $2::timestamptz - interval '1 hour') AS fallos
    FROM s`;

export class SuspensionDelRegistroPg implements SuspensionDelRegistro {
  constructor(private readonly pool: Pool) {}

  async estado(copropiedadId: string, ahora: Date): Promise<EstadoDelRegistro> {
    return comoPlataforma(this.pool, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{ hasta: Date | null; fallos: number }>(SQL_ESTADO, [
        copropiedadId,
        ahora,
      ]);
      const f = rows[0];
      return {
        suspendido: f?.hasta !== null && f?.hasta !== undefined,
        hasta: f?.hasta ?? null,
        fallosRecientes: f?.fallos ?? 0,
      };
    });
  }

  async reanudar(
    copropiedadId: string,
    motivo: string,
    actorId: string,
    ahora: Date,
  ): Promise<boolean> {
    return comoPlataforma(this.pool, actorId, async (c) => {
      await c.query(`SELECT pg_advisory_xact_lock(hashtextextended('ncr:registro:' || $1, 0))`, [
        copropiedadId,
      ]);
      const { rows } = await c.query<{ hasta: Date | null }>(SQL_ESTADO, [copropiedadId, ahora]);
      if (rows[0]?.hasta === null || rows[0]?.hasta === undefined) return false;
      await c.query(
        `INSERT INTO public.bitacora_de_residentes
           (copropiedad_id, ocurrido_en, tipo, actor_id, detalle, creado_por)
         VALUES ($1, $2, 'registro_reanudado', $3, $4, $3)`,
        [copropiedadId, ahora, actorId, motivo.slice(0, 500)],
      );
      await c.query(
        `INSERT INTO public.auditoria_seguridad
           (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
            identificador_solicitado, resultado, creado_por)
         VALUES (NULL, $1, $2, 'cambio_configuracion', 'auth/registro', $3, 'permitido', $2)`,
        [copropiedadId, actorId, `registro reanudado · ${motivo}`.slice(0, 500)],
      );
      return true;
    });
  }
}

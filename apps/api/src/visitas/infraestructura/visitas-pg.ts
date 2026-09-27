import type { Pool } from 'pg';
import type {
  Casilla,
  ConstanciaDeCasilla,
  DatosDeVisitante,
  PersonasDeVisita,
} from '../aplicacion/puertos';
import { conServicio } from './con-servicio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * VISITAS EN POSTGRESQL · ETAPA 15-L (F) · la persona y la casilla
 *
 * Lo que se ESCRIBE al generar una visita. Lo que se lee está en
 * `consulta-de-visitas-pg.ts` (la consola) y `historial-de-visitantes-pg.ts`
 * (el residente).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class PersonasDeVisitaPg implements PersonasDeVisita {
  constructor(private readonly pool: Pool) {}

  /**
   * La persona ACTIVA con ese documento (normalizado como en todo el padrón),
   * o una nueva. El índice único parcial resuelve la carrera de dos altas
   * simultáneas (ADR-04): la que pierde no inserta y vuelve a leer.
   */
  async resolver(
    copropiedadId: string,
    visitante: DatosDeVisitante,
    actorId: string,
  ): Promise<string> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const buscar = async (): Promise<string | undefined> => {
        const { rows } = await c.query<{ id: string }>(
          `SELECT id FROM public.personas
            WHERE copropiedad_id = $1 AND estado = 'activo'
              AND numero_documento = app.normalizar_documento($2)
            ORDER BY creado_en LIMIT 1`,
          [copropiedadId, visitante.documento],
        );
        return rows[0]?.id;
      };
      const existente = await buscar();
      if (existente !== undefined) return existente;
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO public.personas
           (copropiedad_id, tipo_documento, numero_documento, nombre_completo,
            creado_por, actualizado_por)
         VALUES ($1, $2::tipo_documento, app.normalizar_documento($3), $4, $5, $5)
         ON CONFLICT (copropiedad_id, tipo_documento, numero_documento)
           WHERE estado = 'activo' DO NOTHING
         RETURNING id`,
        [copropiedadId, visitante.tipoDocumento, visitante.documento, visitante.nombre, actorId],
      );
      const id = rows[0]?.id ?? (await buscar());
      if (id === undefined) throw new Error('no se pudo registrar al visitante');
      return id;
    });
  }
}

export class ConstanciaDeCasillaPg implements ConstanciaDeCasilla {
  constructor(private readonly pool: Pool) {}

  async anotar(copropiedadId: string, autorizacionId: string, casilla: Casilla): Promise<void> {
    await conServicio(this.pool, copropiedadId, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE public.autorizaciones
            SET consentimiento_declarado_por = $3,
                consentimiento_declarado_en  = $4,
                consentimiento_texto_version = $5,
                actualizado_en = now(), actualizado_por = $3
          WHERE copropiedad_id = $1 AND id = $2`,
        [copropiedadId, autorizacionId, casilla.declaradoPor, casilla.en, casilla.version],
      );
      // Una casilla que no quedó escrita no es una casilla: se dice, no se calla.
      if (rowCount !== 1) {
        throw new Error(
          `la constancia de la casilla no quedó en la autorización ${autorizacionId}`,
        );
      }
    });
  }
}

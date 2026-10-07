import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type {
  EstadoEnEquipo,
  LecturaDeRostros,
  PlantillaViva,
} from '../aplicacion/puertos-del-rostro';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-X · D2 · LO QUE SE LEE DEL ROSTRO DE UN RESIDENTE
 *
 * Un modelo de LECTURA sobre las tablas de este módulo: no escribe ni
 * rehidrata agregados. Nunca el vector: no
 * hay columna de bytes en ninguna de estas sentencias. Con identidad de
 * servicio de la copropiedad y la copropiedad en cada filtro (§2.7.6); quién
 * es la persona lo decide la aplicación con el vínculo del token, no el cuerpo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const VIVAS = `('pendiente_consentimiento', 'pendiente_sincronizacion', 'activa')`;

export class LecturaDeRostrosPg implements LecturaDeRostros {
  constructor(private readonly pool: Pool) {}

  private conServicio<T>(copropiedadId: string, fn: (c: PoolClient) => Promise<T>) {
    return conCliente(this.pool, async (c) => {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      return fn(c);
    });
  }

  vivaDe(copropiedadId: string, personaId: string): Promise<PlantillaViva | null> {
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<{
        id: string;
        calidad: string;
        creado_en: Date;
        suprimir_en: Date;
      }>(
        `SELECT id, calidad::text, creado_en, suprimir_en FROM public.plantillas_biometricas
          WHERE copropiedad_id = $1 AND persona_id = $2 AND autorizacion_id IS NULL
            AND estado IN ${VIVAS}
          ORDER BY creado_en DESC LIMIT 1`,
        [copropiedadId, personaId],
      );
      const f = rows[0];
      return f === undefined
        ? null
        : {
            plantillaId: f.id,
            calidad: Number(f.calidad),
            registradoEn: f.creado_en,
            venceEn: f.suprimir_en,
          };
    });
  }

  enEquipos(copropiedadId: string, plantillaId: string) {
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<{ dispositivo_id: string; estado: string }>(
        `SELECT dispositivo_id, estado::text FROM public.plantilla_sincronizaciones
          WHERE copropiedad_id = $1 AND plantilla_id = $2`,
        [copropiedadId, plantillaId],
      );
      return rows.map((f) => ({
        dispositivoId: f.dispositivo_id,
        estado: (f.estado === 'sincronizada' || f.estado === 'fallida'
          ? f.estado
          : 'pendiente') as EstadoEnEquipo,
      }));
    });
  }

  retiradasPendientes(copropiedadId: string, personaId: string): Promise<number> {
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM public.plantilla_sincronizaciones s
           JOIN public.plantillas_biometricas p
             ON p.copropiedad_id = s.copropiedad_id AND p.id = s.plantilla_id
          WHERE s.copropiedad_id = $1 AND p.persona_id = $2 AND p.autorizacion_id IS NULL
            AND s.estado = 'sincronizada' AND p.estado = 'suprimida'`,
        [copropiedadId, personaId],
      );
      return Number(rows[0]?.n ?? '0');
    });
  }

  /**
   * Las capturas de rostro de RESIDENTE que hizo la cuenta (su `creado_por`) en
   * las 24 h previas, reemplazadas o no: el tope cuenta intentos que llegaron a
   * crear plantilla, no las fotos rechazadas por calidad (esas las frena el
   * límite por IP).
   */
  capturasRecientes(copropiedadId: string, usuarioId: string, ahora: Date) {
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<{ creado_en: Date }>(
        `SELECT creado_en FROM public.plantillas_biometricas
          WHERE copropiedad_id = $1 AND creado_por = $2 AND autorizacion_id IS NULL
            AND creado_en > $3::timestamptz - interval '24 hours'
          ORDER BY creado_en`,
        [copropiedadId, usuarioId, ahora],
      );
      return rows.map((f) => f.creado_en);
    });
  }
}

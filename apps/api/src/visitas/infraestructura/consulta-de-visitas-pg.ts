import type { Pool } from 'pg';
import type {
  ConsultaDeVisitas,
  EstadoDeVisita,
  EstadoEnEquipo,
  FiltroDeVisitas,
  FotoEnEquipo,
  VisitaListada,
  ViviendaDeVisita,
} from '../aplicacion/puertos';
import { conServicio } from './con-servicio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS VISITAS DE LA CONSOLA · ETAPA 15-L (F)
 *
 * EL DÍA DE PORTERÍA SE CALCULA EN LA BASE, con la zona horaria de la
 * copropiedad (`copropiedades.zona_horaria`) y el instante del reloj inyectado.
 * Así «hoy» es el de Bogotá aunque el servidor esté en UTC, y a medianoche la
 * lista cambia sola: nada se borra.
 * ═════════════════════════════════════════════════════════════════════════════
 */
interface FilaDeVisita {
  readonly autorizacion_id: string;
  readonly visitante: string;
  readonly documento: string;
  readonly vivienda_id: string;
  readonly vivienda: string;
  readonly desde: Date;
  readonly hasta: Date;
  readonly estado: EstadoDeVisita;
  readonly placa: string | null;
  readonly generada_por: string | null;
  readonly generada_en: Date;
  readonly anulada_en: Date | null;
  readonly motivo_anulacion: string | null;
  readonly tiene_foto: boolean;
  readonly casilla_por: string | null;
  readonly casilla_en: Date | null;
  readonly plantilla_id: string | null;
  readonly sincronizados: string;
  readonly fallidos: string;
}

/**
 * La visita tal como se enseña. El estado es DERIVADO —se calcula con el
 * instante del reloj, nunca se guarda (D-07)—: una visita que venció a las
 * 18:00 no necesita que nadie la marque vencida.
 */
const SELECCION_DE_VISITA = `
  SELECT a.id AS autorizacion_id,
         p.nombre_completo AS visitante,
         p.numero_documento AS documento,
         a.vivienda_id,
         vi.identificador AS vivienda,
         lower(a.vigencia) AS desde,
         upper(a.vigencia) AS hasta,
         CASE
           WHEN a.estado = 'revocada' THEN 'anulada'
           WHEN upper(a.vigencia) <= $2 THEN 'vencida'
           WHEN lower(a.vigencia) > $2 THEN 'programada'
           ELSE 'vigente'
         END AS estado,
         a.placa,
         u.nombre AS generada_por,
         a.creado_en AS generada_en,
         a.revocada_en AS anulada_en,
         a.motivo_revocacion AS motivo_anulacion,
         a.evidencia_foto_id IS NOT NULL AS tiene_foto,
         uc.nombre AS casilla_por,
         a.consentimiento_declarado_en AS casilla_en,
         pl.id AS plantilla_id,
         COALESCE(s.sincronizados, 0) AS sincronizados,
         COALESCE(s.fallidos, 0) AS fallidos
    FROM public.autorizaciones a
    JOIN public.visitantes v ON v.copropiedad_id = a.copropiedad_id AND v.id = a.visitante_id
    JOIN public.personas p ON p.copropiedad_id = v.copropiedad_id AND p.id = v.persona_id
    JOIN public.viviendas vi ON vi.copropiedad_id = a.copropiedad_id AND vi.id = a.vivienda_id
    LEFT JOIN public.usuarios u ON u.id = a.creado_por
    LEFT JOIN public.usuarios uc ON uc.id = a.consentimiento_declarado_por
    LEFT JOIN LATERAL (
      SELECT pb.id
        FROM public.plantillas_biometricas pb
       WHERE pb.copropiedad_id = a.copropiedad_id AND pb.autorizacion_id = a.id
       ORDER BY pb.creado_en DESC LIMIT 1
    ) pl ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE ps.estado = 'sincronizada') AS sincronizados,
             count(*) FILTER (WHERE ps.estado = 'fallida') AS fallidos
        FROM public.plantilla_sincronizaciones ps
       WHERE ps.copropiedad_id = a.copropiedad_id AND ps.plantilla_id = pl.id
    ) s ON true
   WHERE a.copropiedad_id = $1`;

const aVisita = (f: FilaDeVisita): VisitaListada => ({
  autorizacionId: f.autorizacion_id,
  visitante: f.visitante,
  documento: f.documento,
  viviendaId: f.vivienda_id,
  vivienda: f.vivienda,
  desde: f.desde,
  hasta: f.hasta,
  estado: f.estado,
  placa: f.placa,
  generadaPor: f.generada_por,
  generadaEn: f.generada_en,
  anuladaEn: f.anulada_en,
  motivoAnulacion: f.motivo_anulacion,
  tieneFoto: f.tiene_foto,
  casillaDeclaradaPor: f.casilla_por,
  casillaEn: f.casilla_en,
  plantillaId: f.plantilla_id,
  equiposSincronizados: Number(f.sincronizados),
  equiposFallidos: Number(f.fallidos),
});

/** El texto buscado, sin comodines del usuario: `%` y `_` se escapan. */
const comoPatron = (texto: string): string => `%${texto.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;

export class ConsultaDeVisitasPg implements ConsultaDeVisitas {
  constructor(private readonly pool: Pool) {}

  async listar(copropiedadId: string, f: FiltroDeVisitas): Promise<readonly VisitaListada[]> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<FilaDeVisita>(
        `SELECT * FROM (${SELECCION_DE_VISITA}
            AND ($3::timestamptz IS NULL OR upper(a.vigencia) > $3)
            AND ($4::timestamptz IS NULL OR lower(a.vigencia) < $4)
            AND ($5::uuid IS NULL OR a.vivienda_id = $5)
            AND ($6::text IS NULL
                 OR p.nombre_completo ILIKE $6
                 OR p.numero_documento ILIKE app.normalizar_documento($7) || '%')
         ) x
         WHERE ($8::text IS NULL OR x.estado = $8)
         ORDER BY x.desde DESC, x.generada_en DESC
         LIMIT $9`,
        [
          copropiedadId,
          f.ahora,
          f.desde,
          f.hasta,
          f.viviendaId,
          f.texto === null ? null : comoPatron(f.texto),
          f.texto ?? '',
          f.estado,
          f.limite,
        ],
      );
      return rows.map(aVisita);
    });
  }

  async porId(
    copropiedadId: string,
    autorizacionId: string,
    ahora: Date,
  ): Promise<VisitaListada | null> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<FilaDeVisita>(`${SELECCION_DE_VISITA} AND a.id = $3`, [
        copropiedadId,
        ahora,
        autorizacionId,
      ]);
      const fila = rows[0];
      return fila === undefined ? null : aVisita(fila);
    });
  }

  async diaDe(
    copropiedadId: string,
    ahora: Date,
  ): Promise<{ readonly desde: Date; readonly hasta: Date }> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<{ desde: Date; hasta: Date }>(
        `SELECT (date_trunc('day', $2::timestamptz AT TIME ZONE cp.zona_horaria))
                  AT TIME ZONE cp.zona_horaria AS desde,
                (date_trunc('day', $2::timestamptz AT TIME ZONE cp.zona_horaria) + interval '1 day')
                  AT TIME ZONE cp.zona_horaria AS hasta
           FROM public.copropiedades cp WHERE cp.id = $1`,
        [copropiedadId, ahora],
      );
      const fila = rows[0];
      if (fila === undefined) throw new Error(`copropiedad ${copropiedadId} inexistente`);
      return fila;
    });
  }

  async fotoEnEquipos(
    copropiedadId: string,
    autorizacionId: string,
  ): Promise<readonly FotoEnEquipo[]> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<{
        dispositivo_id: string;
        equipo: string;
        estado: EstadoEnEquipo;
        detalle: string | null;
        intentos: number;
        actualizado_en: Date;
      }>(
        /*
         * R1 (15-N) · TODOS los equipos que podrían tener la foto, no sólo los
         * que tienen fila: un equipo activo de rostros sin fila está
         * «pendiente» si recibe plantillas y «omitido» si no (con el porqué);
         * uno con fila, en su estado. La plantilla, la más reciente de la visita.
         */
        `WITH plantilla AS (
           SELECT p.id FROM public.plantillas_biometricas p
            WHERE p.copropiedad_id = $1 AND p.autorizacion_id = $2
            ORDER BY p.creado_en DESC LIMIT 1)
         SELECT d.id AS dispositivo_id, d.nombre AS equipo,
                COALESCE(s.estado::text,
                  CASE WHEN d.capacidades -> 'bibliotecaDeRostros' ->> 'estado' = 'si'
                       THEN 'pendiente' ELSE 'omitida' END) AS estado,
                CASE
                  WHEN s.estado IS NOT NULL THEN s.ultimo_error
                  WHEN d.capacidades -> 'bibliotecaDeRostros' ->> 'estado' = 'si' THEN NULL
                  WHEN d.capacidades -> 'bibliotecaDeRostros' ->> 'estado' = 'no'
                    THEN 'este equipo no admite rostros'
                  ELSE 'aún no se sabe si admite rostros: use «Probar conexión» en su ficha'
                END AS detalle,
                COALESCE(s.intentos, 0)::int AS intentos,
                COALESCE(s.actualizado_en, d.actualizado_en) AS actualizado_en
           FROM plantilla
           JOIN public.dispositivos d ON d.copropiedad_id = $1
           LEFT JOIN public.plantilla_sincronizaciones s
             ON s.copropiedad_id = d.copropiedad_id AND s.dispositivo_id = d.id
            AND s.plantilla_id = plantilla.id
          WHERE s.plantilla_id IS NOT NULL
             OR (d.estado = 'activo'
                 AND (d.tipo IN ('terminal_facial', 'intercom')
                      OR d.capacidades -> 'bibliotecaDeRostros' ->> 'estado' = 'si'))
          ORDER BY d.nombre`,
        [copropiedadId, autorizacionId],
      );
      return rows.map((r) => ({
        dispositivoId: r.dispositivo_id,
        equipo: r.equipo,
        estado: r.estado,
        detalle: r.detalle,
        intentos: r.intentos,
        actualizadoEn: r.actualizado_en,
      }));
    });
  }

  async viviendas(copropiedadId: string): Promise<readonly ViviendaDeVisita[]> {
    return conServicio(this.pool, copropiedadId, async (c) => {
      const { rows } = await c.query<{ id: string; nombre: string }>(
        `SELECT id, identificador AS nombre FROM public.viviendas
          WHERE copropiedad_id = $1 AND estado = 'activo'
          ORDER BY identificador`,
        [copropiedadId],
      );
      return rows;
    });
  }
}

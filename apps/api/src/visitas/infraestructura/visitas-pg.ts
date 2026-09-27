import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import type {
  Casilla,
  ConsultaDeVisitas,
  ConstanciaDeCasilla,
  DatosDeVisitante,
  DatosParaRepetir,
  EstadoDeVisita,
  EstadoEnEquipo,
  FiltroDeVisitas,
  FotoEnEquipo,
  PersonasDeVisita,
  VisitaListada,
  VisitanteReciente,
  ViviendaDeVisita,
} from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * VISITAS EN POSTGRESQL · ETAPA 15-L (F)
 *
 * Claims de servicio POR COPROPIEDAD en cada llamada, como la biometría: el
 * aislamiento de aplicación (`exigirAlcance`, el segundo camino de §2.7.6) ya
 * ocurrió en el controlador, y cada consulta filtra además por
 * `copropiedad_id` explícito — un parámetro, nunca una concatenación.
 *
 * EL DÍA DE PORTERÍA SE CALCULA EN LA BASE, con la zona horaria de la
 * copropiedad (`copropiedades.zona_horaria`) y el instante del reloj inyectado.
 * Así «hoy» es el de Bogotá aunque el servidor esté en UTC, y a medianoche la
 * lista cambia sola: nada se borra.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const conServicio = async <T>(
  pool: Pool,
  copropiedadId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> => {
  const cliente = await pool.connect();
  try {
    await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(claimsDeServicio(copropiedadId)),
    ]);
    return await fn(cliente);
  } finally {
    cliente.release();
  }
};

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
  readonly consentimiento_id: string | null;
  readonly confirmado: boolean;
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
         pl.consentimiento_id,
         COALESCE(pl.origen = 'otorgado_por_el_titular', false) AS confirmado,
         COALESCE(s.sincronizados, 0) AS sincronizados,
         COALESCE(s.fallidos, 0) AS fallidos
    FROM public.autorizaciones a
    JOIN public.visitantes v ON v.copropiedad_id = a.copropiedad_id AND v.id = a.visitante_id
    JOIN public.personas p ON p.copropiedad_id = v.copropiedad_id AND p.id = v.persona_id
    JOIN public.viviendas vi ON vi.copropiedad_id = a.copropiedad_id AND vi.id = a.vivienda_id
    LEFT JOIN public.usuarios u ON u.id = a.creado_por
    LEFT JOIN public.usuarios uc ON uc.id = a.consentimiento_declarado_por
    LEFT JOIN LATERAL (
      SELECT pb.id, pb.consentimiento_id, cb.origen
        FROM public.plantillas_biometricas pb
        JOIN public.consentimientos_biometricos cb
          ON cb.copropiedad_id = pb.copropiedad_id AND cb.id = pb.consentimiento_id
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
  consentimientoId: f.consentimiento_id,
  confirmadoPorElTitular: f.confirmado,
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
        `SELECT s.dispositivo_id, d.nombre AS equipo, s.estado::text AS estado,
                s.ultimo_error AS detalle, s.intentos, s.actualizado_en
           FROM public.plantillas_biometricas p
           JOIN public.plantilla_sincronizaciones s
             ON s.copropiedad_id = p.copropiedad_id AND s.plantilla_id = p.id
           JOIN public.dispositivos d
             ON d.copropiedad_id = s.copropiedad_id AND d.id = s.dispositivo_id
          WHERE p.copropiedad_id = $1 AND p.autorizacion_id = $2
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
        `SELECT DISTINCT ON (v.persona_id)
                a.id AS autorizacion_id, p.nombre_completo AS visitante,
                p.numero_documento AS documento, lower(a.vigencia) AS ultima_visita,
                a.placa, a.evidencia_foto_id IS NOT NULL AS tiene_foto
           FROM public.autorizaciones a
           JOIN public.visitantes v ON v.copropiedad_id = a.copropiedad_id AND v.id = a.visitante_id
           JOIN public.personas p ON p.copropiedad_id = v.copropiedad_id AND p.id = v.persona_id
          WHERE a.copropiedad_id = $1 AND a.vivienda_id = $2
          ORDER BY v.persona_id, lower(a.vigencia) DESC`,
        [copropiedadId, viviendaId],
      );
      return rows
        .map((r) => ({
          autorizacionId: r.autorizacion_id,
          visitante: r.visitante,
          documento: r.documento,
          ultimaVisita: r.ultima_visita,
          placa: r.placa,
          tieneFoto: r.tiene_foto,
        }))
        .sort((a, b) => b.ultimaVisita.getTime() - a.ultimaVisita.getTime())
        .slice(0, limite);
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

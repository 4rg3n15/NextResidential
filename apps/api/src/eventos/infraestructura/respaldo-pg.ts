import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type {
  Destinatario,
  DestinatariosDelRespaldo,
  EnviosDeRespaldo,
  IntentoDeEnvio,
  IntentoNuevo,
  RepositorioDeRespaldos,
  RespaldoGuardado,
  RespaldoNuevo,
} from '../aplicacion/respaldo/puertos';

/**
 * D-147 · EL RESPALDO DIARIO EN POSTGRESQL (0061)
 *
 * Con los claims de SERVICIO de la copropiedad, por llamada: el trabajo
 * programado no tiene token, y `app.es_servicio(copropiedad_id)` exige nombrar
 * la copropiedad. Sólo `SELECT` e `INSERT`: las dos tablas son append-only
 * (REVOKE, triggers y aserción de despliegue en la 0061); un UPDATE o un
 * DELETE aquí fallaría en la base aunque alguien lo escribiera.
 *
 * Consultas parametrizadas (§2.7.4) y `copropiedad_id` explícito en cada una:
 * la RLS es la segunda barrera, no la única.
 */
const COLUMNAS = `id, copropiedad_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, ruta,
  numero_de_eventos, permitidos, negados, sha256, tamano_bytes, generado_en`;

interface FilaRespaldo {
  readonly id: string;
  readonly copropiedad_id: string;
  readonly fecha: string;
  readonly ruta: string;
  readonly numero_de_eventos: number;
  readonly permitidos: number;
  readonly negados: number;
  readonly sha256: string;
  readonly tamano_bytes: string | number;
  readonly generado_en: Date;
}

const respaldoDe = (f: FilaRespaldo): RespaldoGuardado => ({
  id: f.id,
  copropiedadId: f.copropiedad_id,
  fecha: f.fecha,
  ruta: f.ruta,
  numeroDeEventos: f.numero_de_eventos,
  permitidos: f.permitidos,
  negados: f.negados,
  sha256: f.sha256,
  tamanoBytes: Number(f.tamano_bytes),
  generadoEn: f.generado_en,
});

/** Una transacción con los claims de servicio de UNA copropiedad. */
const comoServicio = <T>(
  pool: Pool,
  copropiedadId: string,
  soloLectura: boolean,
  trabajo: (cliente: PoolClient) => Promise<T>,
): Promise<T> =>
  conCliente(pool, async (cliente) => {
    try {
      await cliente.query(soloLectura ? 'BEGIN READ ONLY' : 'BEGIN');
      await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      const resultado = await trabajo(cliente);
      await cliente.query('COMMIT');
      return resultado;
    } catch (error) {
      await cliente.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  });

export class RepositorioDeRespaldosPg implements RepositorioDeRespaldos {
  constructor(private readonly pool: Pool) {}

  async desde(copropiedadId: string, fecha: string): Promise<readonly RespaldoGuardado[]> {
    return comoServicio(this.pool, copropiedadId, true, async (c) =>
      (
        await c.query<FilaRespaldo>(
          `SELECT ${COLUMNAS} FROM public.respaldos_de_eventos
            WHERE copropiedad_id = $1 AND fecha >= $2::date ORDER BY fecha`,
          [copropiedadId, fecha],
        )
      ).rows.map(respaldoDe),
    );
  }

  async porFecha(copropiedadId: string, fecha: string): Promise<RespaldoGuardado | null> {
    return comoServicio(this.pool, copropiedadId, true, async (c) => {
      const { rows } = await c.query<FilaRespaldo>(
        `SELECT ${COLUMNAS} FROM public.respaldos_de_eventos
          WHERE copropiedad_id = $1 AND fecha = $2::date`,
        [copropiedadId, fecha],
      );
      return rows[0] === undefined ? null : respaldoDe(rows[0]);
    });
  }

  /** `ON CONFLICT DO NOTHING` y se relee: si otra ejecución llegó antes, gana la suya. */
  async registrar(r: RespaldoNuevo, actorId: string): Promise<RespaldoGuardado> {
    return comoServicio(this.pool, r.copropiedadId, false, async (c) => {
      await c.query(
        `INSERT INTO public.respaldos_de_eventos
           (copropiedad_id, fecha, ruta, numero_de_eventos, permitidos, negados,
            sha256, tamano_bytes, creado_por)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (copropiedad_id, fecha) DO NOTHING`,
        [
          r.copropiedadId,
          r.fecha,
          r.ruta,
          r.numeroDeEventos,
          r.permitidos,
          r.negados,
          r.sha256,
          r.tamanoBytes,
          actorId,
        ],
      );
      const { rows } = await c.query<FilaRespaldo>(
        `SELECT ${COLUMNAS} FROM public.respaldos_de_eventos
          WHERE copropiedad_id = $1 AND fecha = $2::date`,
        [r.copropiedadId, r.fecha],
      );
      if (rows[0] === undefined) throw new Error('el respaldo no quedó registrado');
      return respaldoDe(rows[0]);
    });
  }

  async ultimos(copropiedadId: string, cuantos: number): Promise<readonly RespaldoGuardado[]> {
    return comoServicio(this.pool, copropiedadId, true, async (c) =>
      (
        await c.query<FilaRespaldo>(
          `SELECT ${COLUMNAS} FROM public.respaldos_de_eventos
            WHERE copropiedad_id = $1 ORDER BY fecha DESC LIMIT $2`,
          [copropiedadId, cuantos],
        )
      ).rows.map(respaldoDe),
    );
  }
}

/** Los intentos de envío: sólo `SELECT` e `INSERT` (C-68). */
export class EnviosDeRespaldoPg implements EnviosDeRespaldo {
  constructor(private readonly pool: Pool) {}

  async intentos(
    copropiedadId: string,
    respaldoIds: readonly string[],
  ): Promise<readonly IntentoDeEnvio[]> {
    if (respaldoIds.length === 0) return [];
    return comoServicio(this.pool, copropiedadId, true, async (c) =>
      (
        await c.query<{
          respaldo_id: string;
          destinatario_id: string;
          resultado: IntentoDeEnvio['resultado'];
          error: string | null;
          enviado_en: Date | null;
          con_enlace: boolean;
          intentado_en: Date;
        }>(
          `SELECT respaldo_id, destinatario_id, resultado, error, enviado_en, con_enlace, intentado_en
             FROM public.envios_de_respaldo
            WHERE copropiedad_id = $1 AND respaldo_id = ANY($2::uuid[])
            ORDER BY intentado_en DESC, creado_en DESC`,
          [copropiedadId, [...new Set(respaldoIds)]],
        )
      ).rows.map((f) => ({
        respaldoId: f.respaldo_id,
        destinatarioId: f.destinatario_id,
        resultado: f.resultado,
        error: f.error,
        enviadoEn: f.enviado_en,
        conEnlace: f.con_enlace,
        intentadoEn: f.intentado_en,
      })),
    );
  }

  /** Una sola sentencia para todos los destinatarios de la ejecución (sin N+1). */
  async anotar(
    copropiedadId: string,
    intentos: readonly IntentoNuevo[],
    actorId: string,
  ): Promise<void> {
    if (intentos.length === 0) return;
    await comoServicio(this.pool, copropiedadId, false, async (c) => {
      await c.query(
        `INSERT INTO public.envios_de_respaldo
           (copropiedad_id, respaldo_id, destinatario_id, resultado, error, enviado_en,
            con_enlace, creado_por)
         SELECT $1, i.respaldo_id, i.destinatario_id, i.resultado, i.error, i.enviado_en,
                i.con_enlace, $3
           FROM jsonb_to_recordset($2::jsonb) AS i(
                  respaldo_id uuid, destinatario_id uuid, resultado text, error text,
                  enviado_en timestamptz, con_enlace boolean)`,
        [
          copropiedadId,
          JSON.stringify(
            intentos.map((i) => ({
              respaldo_id: i.respaldoId,
              destinatario_id: i.destinatarioId,
              resultado: i.resultado,
              error: i.error,
              enviado_en: i.enviadoEn?.toISOString() ?? null,
              con_enlace: i.conEnlace,
            })),
          ),
          actorId,
        ],
      );
    });
  }
}

/**
 * Los superadministradores ACTIVOS —la cuenta y el rol—, con el correo de su
 * cuenta. Los deja leer la 0060 al servicio de cualquier copropiedad.
 */
export class DestinatariosDelRespaldoPg implements DestinatariosDelRespaldo {
  constructor(private readonly pool: Pool) {}

  async superadministradores(copropiedadId: string): Promise<readonly Destinatario[]> {
    return comoServicio(
      this.pool,
      copropiedadId,
      true,
      async (c) =>
        (
          await c.query<Destinatario>(
            `SELECT DISTINCT u.id, u.correo::text AS correo
             FROM public.usuarios u
             JOIN public.roles_usuario r ON r.usuario_id = u.id
            WHERE r.rol = 'superadministrador' AND r.estado = 'activo'
              AND u.estado = 'activo' AND u.correo IS NOT NULL
              -- El actor de sistema (0025) no es una persona: su correo es
              -- de un dominio reservado que nunca se entrega (RFC 2606).
              AND u.correo::text NOT LIKE '%.invalid'
            ORDER BY u.id`,
          )
        ).rows,
    );
  }

  async nombreDeCopropiedad(copropiedadId: string): Promise<string> {
    return comoServicio(this.pool, copropiedadId, true, async (c) => {
      const { rows } = await c.query<{ nombre: string }>(
        'SELECT nombre FROM public.copropiedades WHERE id = $1',
        [copropiedadId],
      );
      return rows[0]?.nombre ?? copropiedadId;
    });
  }
}

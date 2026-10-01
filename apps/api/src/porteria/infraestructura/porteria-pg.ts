import type { Pool, PoolClient } from 'pg';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { Franja } from '../dominio/turno';
import type {
  DatosDeTurno,
  PerfilDePortero,
  PoolDePorteros,
  RepositorioDePerfiles,
  RepositorioDePools,
  RepositorioDeTurnos,
  TipoDeTurno,
  TurnoRegistrado,
} from '../aplicacion/puertos';
import { conServicio } from './con-servicio';
import { conCliente } from '../../persistencia/con-cliente';

interface FilaPerfil {
  usuario_id: string;
  copropiedad_id: string;
  porteria: string | null;
  sectores: string[];
  correo_contacto: string | null;
  documento: string | null;
}
const aPerfil = (f: FilaPerfil): PerfilDePortero => ({
  usuarioId: f.usuario_id,
  copropiedadId: f.copropiedad_id,
  porteria: f.porteria,
  sectores: f.sectores,
  correoContacto: f.correo_contacto,
  documento: f.documento,
});

/** `perfiles_de_portero`. */
export class PerfilesPg implements RepositorioDePerfiles {
  constructor(private readonly pool: Pool) {}

  async perfilDe(copropiedadId: string, usuarioId: string): Promise<PerfilDePortero | null> {
    return conServicio(this.pool, copropiedadId, null, async (c) => {
      const { rows } = await c.query<FilaPerfil>(
        `SELECT usuario_id, copropiedad_id, porteria, sectores, correo_contacto::text AS correo_contacto,
                documento
           FROM public.perfiles_de_portero WHERE copropiedad_id = $1 AND usuario_id = $2`,
        [copropiedadId, usuarioId],
      );
      return rows[0] === undefined ? null : aPerfil(rows[0]);
    });
  }

  async perfiles(copropiedadId: string): Promise<readonly PerfilDePortero[]> {
    return conServicio(this.pool, copropiedadId, null, async (c) => {
      const { rows } = await c.query<FilaPerfil>(
        `SELECT usuario_id, copropiedad_id, porteria, sectores, correo_contacto::text AS correo_contacto,
                documento
           FROM public.perfiles_de_portero WHERE copropiedad_id = $1 ORDER BY creado_en`,
        [copropiedadId],
      );
      return rows.map(aPerfil);
    });
  }

  async guardar(p: PerfilDePortero, actorId: string): Promise<void> {
    await conServicio(this.pool, p.copropiedadId, actorId, async (c) => {
      await c.query(
        `INSERT INTO public.perfiles_de_portero
           (usuario_id, copropiedad_id, porteria, sectores, correo_contacto, documento,
            creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $7, $6, $6)
         ON CONFLICT (usuario_id) DO UPDATE
           SET porteria = EXCLUDED.porteria, sectores = EXCLUDED.sectores,
               correo_contacto = EXCLUDED.correo_contacto,
               documento = COALESCE(EXCLUDED.documento, perfiles_de_portero.documento)
         WHERE perfiles_de_portero.copropiedad_id = EXCLUDED.copropiedad_id`,
        [
          p.usuarioId,
          p.copropiedadId,
          p.porteria,
          [...p.sectores],
          p.correoContacto,
          actorId,
          p.documento ?? null,
        ],
      );
    });
  }
}

interface FilaTurno {
  id: string;
  copropiedad_id: string;
  portero_id: string;
  porteria: string | null;
  dia: string;
  hora_inicio: string;
  hora_fin: string;
  inicio: Date;
  fin: Date;
  tipo: TipoDeTurno;
  motivo: string | null;
  estado: string;
}
const CAMPOS_TURNO = `id, copropiedad_id, portero_id, porteria, to_char(dia, 'YYYY-MM-DD') AS dia,
  to_char(hora_inicio, 'HH24:MI') AS hora_inicio, to_char(hora_fin, 'HH24:MI') AS hora_fin,
  lower(franja) AS inicio, upper(franja) AS fin, tipo, motivo, estado::text AS estado`;
const aTurno = (f: FilaTurno): TurnoRegistrado => ({
  id: f.id,
  copropiedadId: f.copropiedad_id,
  porteroId: f.portero_id,
  porteria: f.porteria,
  dia: f.dia,
  horaInicio: f.hora_inicio,
  horaFin: f.hora_fin,
  franja: { inicio: f.inicio, fin: f.fin },
  tipo: f.tipo,
  motivo: f.motivo,
  activo: f.estado === 'activo',
});

/**
 * `turnos_de_porteria`. La franja la calcula la BASE (`tg_franja_de_turno`)
 * con la zona de la copropiedad; la que llega del caso de uso se descarta a
 * propósito y la prueba contra base exige que coincidan.
 */
export class TurnosPg implements RepositorioDeTurnos {
  constructor(private readonly pool: Pool) {}

  async vigenteDe(
    copropiedadId: string,
    porteroId: string,
    instante: Date,
  ): Promise<TurnoRegistrado | null> {
    return conServicio(this.pool, copropiedadId, null, async (c) => {
      const { rows } = await c.query<FilaTurno>(
        `SELECT ${CAMPOS_TURNO} FROM public.turnos_de_porteria
          WHERE copropiedad_id = $1 AND portero_id = $2 AND estado = 'activo' AND franja @> $3::timestamptz
          ORDER BY upper(franja) DESC LIMIT 1`,
        [copropiedadId, porteroId, instante],
      );
      return rows[0] === undefined ? null : aTurno(rows[0]);
    });
  }

  async porId(copropiedadId: string, turnoId: string): Promise<TurnoRegistrado | null> {
    return conServicio(this.pool, copropiedadId, null, async (c) => {
      const { rows } = await c.query<FilaTurno>(
        `SELECT ${CAMPOS_TURNO} FROM public.turnos_de_porteria WHERE copropiedad_id = $1 AND id = $2`,
        [copropiedadId, turnoId],
      );
      return rows[0] === undefined ? null : aTurno(rows[0]);
    });
  }

  async entre(
    copropiedadId: string,
    desde: Date,
    hasta: Date,
  ): Promise<readonly TurnoRegistrado[]> {
    return conServicio(this.pool, copropiedadId, null, async (c) => {
      const { rows } = await c.query<FilaTurno>(
        `SELECT ${CAMPOS_TURNO} FROM public.turnos_de_porteria
          WHERE copropiedad_id = $1 AND estado = 'activo' AND franja && tstzrange($2, $3, '[)')
          ORDER BY lower(franja) LIMIT 2000`,
        [copropiedadId, desde, hasta],
      );
      return rows.map(aTurno);
    });
  }

  async guardar(
    copropiedadId: string,
    t: DatosDeTurno & { readonly id?: string; readonly franja: Franja },
    actorId: string,
  ): Promise<TurnoRegistrado | null> {
    return conServicio(this.pool, copropiedadId, actorId, async (c) => {
      const valores = [
        copropiedadId,
        t.porteroId,
        t.porteria,
        t.dia,
        t.horaInicio,
        t.horaFin,
        t.tipo,
        t.motivo,
      ];
      const { rows } =
        t.id === undefined
          ? await c.query<FilaTurno>(
              `INSERT INTO public.turnos_de_porteria
                 (copropiedad_id, portero_id, porteria, dia, hora_inicio, hora_fin, tipo, motivo,
                  franja, creado_por, actualizado_por)
               VALUES ($1, $2, $3, $4::date, $5::time, $6::time, $7, $8, 'empty', $9, $9)
               RETURNING ${CAMPOS_TURNO}`,
              [...valores, actorId],
            )
          : await c.query<FilaTurno>(
              `UPDATE public.turnos_de_porteria
                  SET portero_id = $2, porteria = $3, dia = $4::date, hora_inicio = $5::time,
                      hora_fin = $6::time, tipo = $7, motivo = $8
                WHERE copropiedad_id = $1 AND id = $9 AND estado = 'activo'
                RETURNING ${CAMPOS_TURNO}`,
              [...valores, t.id],
            );
      return rows[0] === undefined ? null : aTurno(rows[0]);
    });
  }

  async retirar(
    copropiedadId: string,
    turnoId: string,
    motivo: string,
    actorId: string,
    ahora: Date,
  ): Promise<boolean> {
    return conServicio(this.pool, copropiedadId, actorId, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE public.turnos_de_porteria
            SET estado = 'inactivo', desactivado_en = $3, desactivado_por = $4, motivo_desactivacion = $5
          WHERE copropiedad_id = $1 AND id = $2 AND estado = 'activo'`,
        [copropiedadId, turnoId, ahora, actorId, motivo],
      );
      return (rowCount ?? 0) > 0;
    });
  }
}

/**
 * H1 · H2 (15-L) · el pool de identificadores y su cupo (0042). Es de
 * plataforma: se lee y se cambia con los claims del superadministrador, y el
 * cupo sólo lo cambia él (la política de la tabla lo exige).
 */
export class PoolsPg implements RepositorioDePools {
  constructor(private readonly pool: Pool) {}

  async de(copropiedadId: string): Promise<PoolDePorteros | null> {
    return comoPlataforma(this.pool, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{
        inicio: number;
        fin: number;
        siguiente: number;
        cupo: number;
      }>(
        `SELECT inicio, fin, siguiente, cupo FROM public.pools_de_porteros WHERE copropiedad_id = $1`,
        [copropiedadId],
      );
      return rows[0] ?? null;
    });
  }

  async fijarCupo(copropiedadId: string, cupo: number, actorId: string): Promise<boolean> {
    return comoPlataforma(this.pool, actorId, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE public.pools_de_porteros
            SET cupo = $2, actualizado_en = now(), actualizado_por = $3
          WHERE copropiedad_id = $1`,
        [copropiedadId, cupo, actorId],
      );
      return (rowCount ?? 0) > 0;
    });
  }
}

const comoPlataforma = async <T>(
  pool: Pool,
  actorId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> => {
  return conCliente(pool, async (c) => {
    try {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ rol: 'superadministrador', usuario_id: actorId, copropiedad_id: null }),
      ]);
      return await fn(c);
    } finally {
      await c.query("SELECT set_config('request.jwt.claims', '', false)").catch(() => undefined);
    }
  });
};

import { isIP } from 'node:net';
import type { Pool, PoolClient } from 'pg';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { normalizarOrigen } from '../../comun/direccion-ip';
import type {
  AjustesDePlataforma,
  EventoDeSeguridad,
  RegistroDePresencia,
  RegistroDeSeguridad,
  ReglasDeIp,
  RepositorioDeReglasDeIp,
} from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PLATAFORMA EN POSTGRESQL · ETAPA 15-L (H) · migración 0042
 *
 * Todo lo de aquí es de plataforma, no de una copropiedad: se lee y se escribe
 * con los claims de superadministrador (como las cuentas, ADR-023) y la RLS
 * forzada de la 0042 deja hacerlo sólo con ellos. Cuatro clases, una por
 * puerto, sobre la misma conexión.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const plataforma = (actorId: string = ACTOR_INGESTA): string =>
  JSON.stringify({ rol: 'superadministrador', usuario_id: actorId, copropiedad_id: null });

const con = async <T>(
  pool: Pool,
  claims: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> => {
  const cliente = await pool.connect();
  try {
    await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [claims]);
    return await fn(cliente);
  } finally {
    await cliente
      .query("SELECT set_config('request.jwt.claims', '', false)")
      .catch(() => undefined);
    cliente.release();
  }
};

const ipOnull = (ip: string | null): string | null => {
  const direccion = normalizarOrigen(ip);
  return isIP(direccion) !== 0 ? direccion : null;
};

export class AjustesDePlataformaPg implements AjustesDePlataforma {
  constructor(private readonly pool: Pool) {}

  async modoPruebas(): Promise<boolean> {
    return con(this.pool, plataforma(), async (c) => {
      const { rows } = await c.query<{ modo_pruebas: boolean }>(
        'SELECT modo_pruebas FROM public.ajustes_globales WHERE id',
      );
      // Sin fila (una base sin la 0042 aplicada entera): inactivo, que es lo prudente.
      return rows[0]?.modo_pruebas ?? false;
    });
  }

  async fijarModoPruebas(activo: boolean, actorId: string, ip: string | null): Promise<void> {
    await con(this.pool, plataforma(actorId), async (c) => {
      await c.query('BEGIN');
      try {
        const { rows } = await c.query<{ antes: boolean }>(
          `UPDATE public.ajustes_globales a
              SET modo_pruebas = $1, actualizado_en = now(), actualizado_por = $2
             FROM (SELECT modo_pruebas AS antes FROM public.ajustes_globales WHERE id) previo
            WHERE a.id
        RETURNING previo.antes`,
          [activo, actorId],
        );
        const antes = rows[0]?.antes;
        await c.query(
          `INSERT INTO public.auditoria_seguridad
             (usuario_id, tipo, recurso, identificador_solicitado, ip, resultado)
           VALUES ($1, 'cambio_configuracion', $2, 'modo_pruebas', $3, 'permitido')`,
          [
            actorId,
            `plataforma/modo-pruebas: ${antes === undefined ? '?' : antes ? 'activo' : 'inactivo'} → ${activo ? 'activo' : 'inactivo'}`,
            ipOnull(ip),
          ],
        );
        await c.query('COMMIT');
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      }
    });
  }
}

export class ReglasDeIpPg implements RepositorioDeReglasDeIp {
  constructor(private readonly pool: Pool) {}

  async de(copropiedadId: string): Promise<ReglasDeIp> {
    return con(this.pool, plataforma(), async (c) => {
      const { rows } = await c.query<{ porteria: string[] | null; remotas: string[] | null }>(
        `SELECT ARRAY(SELECT abbrev(x) FROM unnest(ips_porteria) x) AS porteria,
                ARRAY(SELECT abbrev(x) FROM unnest(ips_guardia_remota) x) AS remotas
           FROM public.copropiedades WHERE id = $1`,
        [copropiedadId],
      );
      return { ipsPorteria: rows[0]?.porteria ?? [], ipsRemotas: rows[0]?.remotas ?? [] };
    });
  }
}

export class RegistroDePresenciaPg implements RegistroDePresencia {
  constructor(private readonly pool: Pool) {}

  async anotar(p: {
    readonly sesionId: string;
    readonly usuarioId: string;
    readonly ip: string;
    readonly ahora: Date;
  }): Promise<void> {
    const ip = ipOnull(p.ip);
    if (ip === null) return;
    await con(this.pool, plataforma(p.usuarioId), (c) =>
      c.query(
        `INSERT INTO public.sesiones_de_superadministrador
           (sesion_id, usuario_id, ip, iniciada_en, ultima_actividad, creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $4, $2, $2)
         ON CONFLICT (sesion_id) DO UPDATE
           SET ip = EXCLUDED.ip, ultima_actividad = EXCLUDED.ultima_actividad,
               actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por
         WHERE sesiones_de_superadministrador.cerrada_en IS NULL`,
        [p.sesionId, p.usuarioId, ip, p.ahora],
      ),
    );
  }

  async cerrar(sesionId: string, ahora: Date): Promise<void> {
    await con(this.pool, plataforma(), (c) =>
      c.query(
        `UPDATE public.sesiones_de_superadministrador
            SET cerrada_en = $2, actualizado_en = now()
          WHERE sesion_id = $1 AND cerrada_en IS NULL`,
        [sesionId, ahora],
      ),
    );
  }

  async ipsActivas(desde: Date): Promise<readonly string[]> {
    return con(this.pool, plataforma(), async (c) => {
      const { rows } = await c.query<{ ip: string }>(
        `SELECT DISTINCT host(ip) AS ip FROM public.sesiones_de_superadministrador
          WHERE cerrada_en IS NULL AND ultima_actividad >= $1`,
        [desde],
      );
      return rows.map((r) => r.ip);
    });
  }
}

export class RegistroDeSeguridadPg implements RegistroDeSeguridad {
  constructor(private readonly pool: Pool) {}

  async registrar(e: EventoDeSeguridad): Promise<void> {
    await con(this.pool, plataforma(), (c) =>
      c.query(
        `INSERT INTO public.auditoria_seguridad
           (copropiedad_id_objetivo, usuario_id, tipo, recurso, identificador_solicitado,
            ip, user_agent, resultado, ocurrido_en)
         VALUES ($1, $2, $3::tipo_evento_seguridad, $4, $5, $6, $7, $8, $9)`,
        [
          e.copropiedadId,
          e.usuarioId,
          e.tipo,
          e.recurso.slice(0, 300),
          e.identificador === null ? null : e.identificador.slice(0, 300),
          ipOnull(e.ip),
          e.agente === null ? null : e.agente.slice(0, 300),
          e.resultado,
          e.ocurridoEn,
        ],
      ),
    );
  }

  async fallosRecientes(ip: string, identificador: string, desde: Date): Promise<number> {
    const direccion = ipOnull(ip);
    if (direccion === null) return 0;
    return con(this.pool, plataforma(), async (c) => {
      const { rows } = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM public.auditoria_seguridad
          WHERE tipo = 'login_fallido' AND ip = $1::inet
            AND identificador_solicitado = $2 AND ocurrido_en >= $3`,
        [direccion, identificador.slice(0, 300), desde],
      );
      return Number(rows[0]?.n ?? 0);
    });
  }
}

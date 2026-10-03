import type { Pool, PoolClient } from 'pg';
import type { ContextoTenant } from '../../autenticacion';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type { FichaDeEdge, RepositorioDePuentes, ResultadoDeMarca } from '../aplicacion/puentes';

/**
 * `edge_gateways.puente` (0050) en PostgreSQL, con las mismas identidades que
 * `gateways-pg.ts`: la puerta del túnel lee con claims de lectura del proceso
 * (hay que poder auditar un Edge de OTRA copropiedad); la ficha y la marca, con
 * la sesión de quien las pide, y la RLS (`edge_lectura`, `edge_edicion`) decide.
 */
const CLAIMS_DE_LECTURA = JSON.stringify({
  rol: 'superadministrador',
  usuario_id: ACTOR_INGESTA,
  copropiedad_id: null,
  copropiedades: [],
});

const claimsDe = (ctx: ContextoTenant): string =>
  JSON.stringify({
    rol: ctx.rol,
    usuario_id: ctx.usuarioId,
    copropiedad_id: ctx.copropiedadId,
    copropiedades: ctx.copropiedadesAtendidas,
  });

interface Fila {
  readonly id: string;
  readonly nombre: string;
  readonly puente: boolean;
  readonly puente_desde: Date | null;
  readonly ultimo_latido: Date | null;
  readonly version_reglas_cache: string;
}

export class PuentesPg implements RepositorioDePuentes {
  constructor(private readonly pool: Pool) {}

  private conClaims<T>(claims: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return conCliente(this.pool, async (c) => {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [claims]);
      return await fn(c);
    });
  }

  esPuente(edgeId: string): Promise<boolean> {
    return this.conClaims(CLAIMS_DE_LECTURA, async (c) => {
      const { rows } = await c.query<{ puente: boolean }>(
        `SELECT puente FROM public.edge_gateways WHERE id = $1 AND estado = 'activo'`,
        [edgeId],
      );
      return rows[0]?.puente === true;
    });
  }

  deCopropiedad(ctx: ContextoTenant, copropiedadId: string): Promise<readonly FichaDeEdge[]> {
    return this.conClaims(claimsDe(ctx), async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT id, nombre, puente, puente_desde, ultimo_latido, version_reglas_cache::text
           FROM public.edge_gateways
          WHERE copropiedad_id = $1 AND estado = 'activo'
          ORDER BY nombre`,
        [copropiedadId],
      );
      return rows.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        puente: f.puente,
        puenteDesde: f.puente_desde,
        ultimoLatido: f.ultimo_latido,
        versionDeReglas: Number(f.version_reglas_cache),
      }));
    });
  }

  marcar(
    ctx: ContextoTenant,
    copropiedadId: string,
    edgeId: string,
    puente: boolean,
    ahora: Date,
  ): Promise<ResultadoDeMarca> {
    return this.conClaims(claimsDe(ctx), async (c) => {
      const r = await c
        .query(
          `UPDATE public.edge_gateways
            SET puente = $3, puente_desde = CASE WHEN $3 THEN $4::timestamptz ELSE NULL END,
                actualizado_por = $5
          WHERE id = $1 AND copropiedad_id = $2 AND estado = 'activo'`,
          [edgeId, copropiedadId, puente, ahora, ctx.usuarioId],
        )
        .catch((e: unknown) => {
          // `edge_un_puente_por_copropiedad` (0050): ya hay otro puente.
          if ((e as { code?: string }).code === '23505') return null;
          throw e;
        });
      if (r === null) return 'otro_puente';
      return (r.rowCount ?? 0) > 0 ? 'marcado' : 'no_encontrado';
    });
  }
}

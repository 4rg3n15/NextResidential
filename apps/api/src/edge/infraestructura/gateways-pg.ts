import type { Pool, PoolClient } from 'pg';
import type { ContextoTenant } from '../../autenticacion';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';
import type { GatewayRegistrado, RepositorioDeGateways } from '../aplicacion/puertos';
import { referenciaDeGeneracion, siguienteReferencia } from './referencia-de-credencial';

/**
 * `edge_gateways` (0009, D-16) en PostgreSQL.
 *
 * Tres identidades, cada una para lo suyo:
 *  · la BÚSQUEDA por identificador lee con claims de superadministrador de
 *    sólo lectura —el precedente es la acreditación de cámaras por secreto
 *    (`secretos-de-alarm-server-pg.ts`)—: hay que poder encontrar un Edge de
 *    OTRA copropiedad para saber que la pidió y auditarlo. La decisión la toma
 *    la aplicación (`AcreditarEdge`), no esta lectura;
 *  · la ANOTACIÓN de la descarga escribe con la identidad de servicio de la
 *    copropiedad DEL Edge (`edge_edicion` lo admite);
 *  · el ALTA y la ROTACIÓN las hace el superadministrador con SU sesión
 *    (`edge_insercion`, `edge_edicion`).
 *
 * Ninguna consulta lee ni escribe un secreto: sólo la referencia (RN-21).
 */

const CLAIMS_DE_LECTURA = JSON.stringify({
  rol: 'superadministrador',
  usuario_id: ACTOR_INGESTA,
  copropiedad_id: null,
  copropiedades: [],
});

interface Fila {
  readonly id: string;
  readonly copropiedad_id: string;
  readonly nombre: string;
  readonly usuario_servicio_id: string;
  readonly credencial_ref: string;
  readonly estado: string;
}

const COLUMNAS = 'id, copropiedad_id, nombre, usuario_servicio_id, credencial_ref, estado::text';

const aGateway = (f: Fila): GatewayRegistrado => ({
  id: f.id,
  copropiedadId: f.copropiedad_id,
  nombre: f.nombre,
  usuarioServicioId: f.usuario_servicio_id,
  credencialRef: f.credencial_ref,
  activo: f.estado === 'activo',
});

const claimsDe = (ctx: ContextoTenant): string =>
  JSON.stringify({
    rol: ctx.rol,
    usuario_id: ctx.usuarioId,
    copropiedad_id: ctx.copropiedadId,
    copropiedades: ctx.copropiedadesAtendidas,
  });

export class GatewaysPg implements RepositorioDeGateways {
  constructor(private readonly pool: Pool) {}

  private conClaims<T>(claims: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return conCliente(this.pool, async (c) => {
      await c.query("SELECT set_config('request.jwt.claims', $1, false)", [claims]);
      return await fn(c);
    });
  }

  async porId(id: string): Promise<GatewayRegistrado | null> {
    return this.conClaims(CLAIMS_DE_LECTURA, async (c) => {
      const { rows } = await c.query<Fila>(
        `SELECT ${COLUMNAS} AS estado FROM public.edge_gateways WHERE id = $1`,
        [id],
      );
      return rows[0] === undefined ? null : aGateway(rows[0]);
    });
  }

  async anotarDescarga(gateway: GatewayRegistrado, version: number, ahora: Date): Promise<void> {
    const claims = JSON.stringify(claimsDeServicio(gateway.copropiedadId));
    await this.conClaims(claims, (c) =>
      c.query(
        `UPDATE public.edge_gateways
            SET cache_actualizado_en = CASE WHEN version_reglas_cache <> $3
                                            THEN $4::timestamptz ELSE cache_actualizado_en END,
                version_reglas_cache = $3, ultimo_latido = $4, actualizado_por = $5
          WHERE id = $1 AND copropiedad_id = $2`,
        [gateway.id, gateway.copropiedadId, version, ahora, gateway.usuarioServicioId],
      ),
    );
  }

  async registrar(
    ctx: ContextoTenant,
    copropiedadId: string,
    nombre: string,
  ): Promise<GatewayRegistrado> {
    return this.conClaims(claimsDe(ctx), async (c) => {
      const { rows } = await c.query<Fila>(
        `INSERT INTO public.edge_gateways
           (copropiedad_id, nombre, usuario_servicio_id, credencial_ref, creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING ${COLUMNAS} AS estado`,
        [copropiedadId, nombre, ACTOR_INGESTA, referenciaDeGeneracion(1), ctx.usuarioId],
      );
      const fila = rows[0];
      if (fila === undefined) throw new Error('el alta del Edge no devolvió la fila');
      return aGateway(fila);
    });
  }

  async rotar(
    ctx: ContextoTenant,
    copropiedadId: string,
    edgeId: string,
  ): Promise<GatewayRegistrado | null> {
    return this.conClaims(claimsDe(ctx), async (c) => {
      const actual = await c.query<Fila>(
        `SELECT ${COLUMNAS} AS estado FROM public.edge_gateways
          WHERE id = $1 AND copropiedad_id = $2 AND estado = 'activo'`,
        [edgeId, copropiedadId],
      );
      const fila = actual.rows[0];
      if (fila === undefined) return null;
      const { rows } = await c.query<Fila>(
        `UPDATE public.edge_gateways SET credencial_ref = $3, actualizado_por = $4
          WHERE id = $1 AND copropiedad_id = $2
         RETURNING ${COLUMNAS} AS estado`,
        [edgeId, copropiedadId, siguienteReferencia(fila.credencial_ref), ctx.usuarioId],
      );
      return rows[0] === undefined ? null : aGateway(rows[0]);
    });
  }
}

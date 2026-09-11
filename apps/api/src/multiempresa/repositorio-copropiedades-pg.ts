import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { ContextoTenant } from '../autenticacion';
import type { CopropiedadResumen, RepositorioCopropiedades } from './repositorio-copropiedades';
import { filtrarPorAlcance } from './repositorio-copropiedades';

/**
 * Catálogo de copropiedades contra PostgreSQL, **por los dos caminos de
 * §2.7.6**.
 *
 * 1. Fija `request.jwt.claims` en la MISMA conexión que ejecuta la consulta, de
 *    modo que la política `copropiedades_lectura` decide qué filas existen.
 *    Para el superadministrador eso es `app.es_superadmin()`, que es
 *    exactamente lo que hace que su alcance sea global sin pertenecer a
 *    ninguna.
 * 2. Vuelve a filtrar en la aplicación con `filtrarPorAlcance`. No es
 *    desconfianza de la RLS: es que la llave secreta la OMITE, y este mismo
 *    repositorio podría cablearse un día bajo esa llave. Con el filtro, el peor
 *    caso es una lista de menos, nunca de más.
 *
 * Si los dos caminos discrepasen, la intersección es lo que sale. Es la
 * respuesta conservadora y no hay ninguna en la que convenga la contraria.
 */
@Injectable()
export class RepositorioCopropiedadesPg implements RepositorioCopropiedades {
  constructor(private readonly pool: Pool) {}

  private claimsDe(ctx: ContextoTenant): Record<string, unknown> {
    return {
      rol: ctx.rol,
      usuario_id: ctx.usuarioId,
      // La RLS lee este campo; en el superadministrador va nulo a propósito y
      // `app.es_superadmin()` es quien concede.
      copropiedad_id: ctx.copropiedadId,
      copropiedades: ctx.copropiedadesAtendidas,
    };
  }

  async listarParaElAlcance(ctx: ContextoTenant): Promise<readonly CopropiedadResumen[]> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claimsDe(ctx)),
      ]);
      const { rows } = await cliente.query<{
        id: string;
        nombre: string;
        zona_horaria: string;
      }>(
        `SELECT id, nombre, zona_horaria
           FROM public.copropiedades
          WHERE estado = 'activa'
          ORDER BY nombre ASC`,
      );
      const leidas = rows.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        zonaHoraria: r.zona_horaria,
      }));
      return filtrarPorAlcance(ctx, leidas);
    } finally {
      cliente.release();
    }
  }
}

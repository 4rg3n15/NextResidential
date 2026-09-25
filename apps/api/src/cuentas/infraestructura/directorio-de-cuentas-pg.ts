import type { Pool } from 'pg';
import type { DirectorioDeCuentas, ResumenDeCuenta } from '../aplicacion/puertos';

interface Fila {
  id: string;
  nombre_usuario: string | null;
  nombre: string;
  telefono: string | null;
  estado: string;
  debe_cambiar_contrasena: boolean;
}

/**
 * Los datos visibles de una cuenta para el panel de supervisión. Lee y escribe
 * con los claims del superadministrador ACTOR —el único que llega aquí— y
 * filtra además por copropiedad en la consulta: el segundo camino de §2.7.6.
 * `correo` no aparece en ninguna columna seleccionada.
 */
export class DirectorioDeCuentasPg implements DirectorioDeCuentas {
  constructor(private readonly pool: Pool) {}

  async resumenes(
    copropiedadId: string,
    usuarioIds: readonly string[],
  ): Promise<readonly ResumenDeCuenta[]> {
    if (usuarioIds.length === 0) return [];
    const { rows } = await this.consultar<Fila>(
      null,
      `SELECT id, nombre_usuario::text AS nombre_usuario, nombre, telefono, estado::text AS estado,
              debe_cambiar_contrasena
         FROM public.usuarios
        WHERE copropiedad_id = $1 AND id = ANY($2::uuid[])`,
      [copropiedadId, [...usuarioIds]],
    );
    return rows.map((f) => ({
      usuarioId: f.id,
      usuario: f.nombre_usuario,
      nombre: f.nombre,
      telefono: f.telefono,
      activa: f.estado === 'activo',
      debeCambiarContrasena: f.debe_cambiar_contrasena,
    }));
  }

  async actualizarDatos(
    copropiedadId: string,
    usuarioId: string,
    datos: { readonly nombre: string; readonly telefono: string | null },
    actorId: string,
  ): Promise<boolean> {
    const { rowCount } = await this.consultar(
      actorId,
      `UPDATE public.usuarios SET nombre = $3, telefono = $4
        WHERE copropiedad_id = $1 AND id = $2`,
      [copropiedadId, usuarioId, datos.nombre, datos.telefono],
    );
    return (rowCount ?? 0) > 0;
  }

  private async consultar<T extends object>(
    actorId: string | null,
    sql: string,
    parametros: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query('BEGIN');
      await cliente.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({
          rol: 'superadministrador',
          usuario_id: actorId ?? '00000000-0000-4000-8000-000000000003',
          copropiedad_id: null,
          copropiedades: [],
        }),
      ]);
      const r = await cliente.query<T>(sql, parametros);
      await cliente.query('COMMIT');
      return { rows: r.rows, rowCount: r.rowCount };
    } catch (error) {
      await cliente.query('ROLLBACK');
      throw error;
    } finally {
      cliente.release();
    }
  }
}

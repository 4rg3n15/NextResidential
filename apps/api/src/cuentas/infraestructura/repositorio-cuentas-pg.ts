import type { Pool, PoolClient } from 'pg';
import type { Rol } from '../../autenticacion';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { NombreDeUsuario } from '../dominio/nombre-de-usuario';
import type { AltaDeCuenta, IdentidadDeCuenta, RepositorioDeCuentas } from '../aplicacion/puertos';

/**
 * `usuarios` y `roles_usuario` para el módulo de cuentas (ADR-023).
 *
 * **Con qué identidad habla con la base, y por qué.** La lectura de acceso
 * (NIT → copropiedad, identidad de una cuenta) ocurre ANTES de que exista un
 * token —es el inicio de sesión—, así que usa la identidad de lectura de
 * plataforma, la misma que el registro de equipos (D5). Las escrituras usan la
 * de ADMINISTRACIÓN con el actor real en `usuario_id`, para que
 * `creado_por`/`actualizado_por` digan quién fue. En los dos casos la base no
 * es la barrera de permiso: lo es la capa de aplicación, que ya decidió qué
 * rol restablece a quién y a qué copropiedad alcanza (§2.7.6, segundo camino),
 * y la suite de aislamiento lo prueba por las dos vías.
 *
 * Ninguna consulta lee ni escribe un correo sintético: no existe en la base.
 */
const lectura = (): Record<string, unknown> => ({
  rol: 'superadministrador',
  usuario_id: ACTOR_INGESTA,
  copropiedad_id: null,
  copropiedades: [],
});
const administracion = (actorId: string): Record<string, unknown> => ({
  rol: 'superadministrador',
  usuario_id: actorId,
  copropiedad_id: null,
  copropiedades: [],
});

interface FilaDeIdentidad {
  id: string;
  auth_user_id: string;
  copropiedad_id: string | null;
  correo: string | null;
  nombre_usuario: string | null;
  rol: Rol | null;
}

export class RepositorioDeCuentasPg implements RepositorioDeCuentas {
  constructor(private readonly pool: Pool) {}

  async copropiedadPorNit(nit: string): Promise<string | null> {
    return this.con(lectura(), async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM public.copropiedades WHERE nit = $1 AND estado = 'activa'`,
        [nit],
      );
      return rows[0]?.id ?? null;
    });
  }

  async copropiedadPorCodigo(codigo: string): Promise<string | null> {
    return this.con(lectura(), async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM public.copropiedades WHERE codigo_corto = $1 AND estado = 'activa'`,
        [codigo],
      );
      return rows[0]?.id ?? null;
    });
  }

  async identidadDe(usuarioId: string): Promise<IdentidadDeCuenta | null> {
    return this.con(lectura(), async (c) => {
      const { rows } = await c.query<FilaDeIdentidad>(
        `SELECT u.id, u.auth_user_id, u.copropiedad_id, u.correo::text AS correo,
                u.nombre_usuario::text AS nombre_usuario,
                (SELECT r.rol::text FROM public.roles_usuario r
                  WHERE r.usuario_id = u.id AND r.estado = 'activo'
                  ORDER BY app.precedencia_de_rol(r.rol), r.creado_en LIMIT 1) AS rol
           FROM public.usuarios u
          WHERE u.id = $1 AND u.estado = 'activo'`,
        [usuarioId],
      );
      const f = rows[0];
      if (f === undefined) return null;
      const acceso =
        f.nombre_usuario !== null
          ? ({ tipo: 'usuario', usuario: f.nombre_usuario as NombreDeUsuario } as const)
          : f.correo !== null
            ? ({ tipo: 'correo', correo: f.correo } as const)
            : null;
      if (acceso === null) return null;
      return {
        usuarioId: f.id,
        authUserId: f.auth_user_id,
        copropiedadId: f.copropiedad_id,
        rol: f.rol,
        acceso,
      };
    });
  }

  async existeNombre(copropiedadId: string, usuario: NombreDeUsuario): Promise<boolean> {
    return this.con(lectura(), async (c) => {
      const { rowCount } = await c.query(
        'SELECT 1 FROM public.usuarios WHERE copropiedad_id = $1 AND nombre_usuario = $2',
        [copropiedadId, usuario],
      );
      return (rowCount ?? 0) > 0;
    });
  }

  async crearPorNombre(alta: AltaDeCuenta, actorId: string): Promise<string | null> {
    return this.con(administracion(actorId), async (c) => {
      await c.query('BEGIN');
      try {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO public.usuarios
             (copropiedad_id, auth_user_id, correo, nombre_usuario, nombre, telefono,
              debe_cambiar_contrasena, creado_por, actualizado_por)
           VALUES ($1, $2, NULL, $3, $4, $5, true, $6, $6)
           RETURNING id`,
          [alta.copropiedadId, alta.authUserId, alta.usuario, alta.nombre, alta.telefono, actorId],
        );
        const usuarioId = rows[0]?.id;
        if (usuarioId === undefined)
          throw new Error('el alta de usuario no devolvió identificador');
        await c.query(
          `INSERT INTO public.roles_usuario (copropiedad_id, usuario_id, rol, creado_por, actualizado_por)
           VALUES ($1, $2, $3::rol_usuario, $4, $4)`,
          [alta.copropiedadId, usuarioId, alta.rol, actorId],
        );
        await c.query('COMMIT');
        return usuarioId;
      } catch (error) {
        await c.query('ROLLBACK');
        const e = error as { code?: string; constraint?: string };
        if (e.code === '23505' && e.constraint === 'usuarios_nombre_usuario_uk') return null;
        throw error;
      }
    });
  }

  async fijarCambioObligatorio(
    usuarioId: string,
    pendiente: boolean,
    actorId: string,
  ): Promise<void> {
    await this.con(administracion(actorId), async (c) => {
      await c.query('UPDATE public.usuarios SET debe_cambiar_contrasena = $2 WHERE id = $1', [
        usuarioId,
        pendiente,
      ]);
    });
  }

  private async con<T>(
    claims: Record<string, unknown>,
    fn: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claims),
      ]);
      return await fn(cliente);
    } finally {
      await cliente
        .query("SELECT set_config('request.jwt.claims', '', false)")
        .catch(() => undefined);
      cliente.release();
    }
  }
}

import type { Pool } from 'pg';
import type { PerfilValido } from '@ncr/domain-core';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type { PerfilDelResidente, PerfilGuardado } from '../aplicacion/puertos-hogar';
import { comoServicio, violacion } from './con-identidad';

/**
 * PERFIL DEL RESIDENTE CONTRA POSTGRESQL (3.5, D7). La persona se alcanza desde
 * la CUENTA (`usuarios.persona_id`), nunca por un identificador de la petición.
 * La copropiedad —nombre, dirección y teléfono de portería— se lee y no se
 * escribe desde aquí.
 */
export class PerfilDelResidentePg implements PerfilDelResidente {
  constructor(private readonly pool: Pool) {}

  async perfil(copropiedadId: string, usuarioId: string): Promise<PerfilGuardado | null> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{
        nombres: string | null;
        apellidos: string | null;
        nombre_completo: string;
        fecha_nacimiento: string | null;
        tipo_documento: string | null;
        numero_documento: string | null;
        correo: string | null;
        telefono: string | null;
        copropiedad_nombre: string;
        copropiedad_direccion: string | null;
        telefono_porteria: string | null;
      }>(
        `SELECT per.nombres, per.apellidos, per.nombre_completo,
                to_char(per.fecha_nacimiento, 'YYYY-MM-DD') AS fecha_nacimiento,
                per.tipo_documento::text AS tipo_documento, per.numero_documento,
                per.correo::text AS correo, per.telefono,
                c.nombre AS copropiedad_nombre, c.direccion AS copropiedad_direccion,
                c.telefono_porteria
           FROM public.usuarios u
           JOIN public.personas per ON per.id = u.persona_id
           JOIN public.copropiedades c ON c.id = u.copropiedad_id
          WHERE u.id = $2 AND u.copropiedad_id = $1 AND u.estado = 'activo'`,
        [copropiedadId, usuarioId],
      );
      const f = rows[0];
      if (f === undefined) return null;
      return {
        nombres: f.nombres,
        apellidos: f.apellidos,
        nombreCompleto: f.nombre_completo,
        fechaNacimiento: f.fecha_nacimiento,
        tipoDocumento: f.tipo_documento,
        numeroDocumento: f.numero_documento,
        correo: f.correo,
        telefono: f.telefono,
        copropiedadNombre: f.copropiedad_nombre,
        copropiedadDireccion: f.copropiedad_direccion,
        telefonoPorteria: f.telefono_porteria,
      };
    });
  }

  async guardar(
    copropiedadId: string,
    usuarioId: string,
    d: PerfilValido,
  ): Promise<'guardado' | 'DOCUMENTO_EN_USO' | 'SIN_VINCULO'> {
    try {
      return await comoServicio(this.pool, copropiedadId, usuarioId, async (c) => {
        const { rows } = await c.query<{ persona_id: string | null }>(
          'SELECT persona_id FROM public.usuarios WHERE id = $1 AND copropiedad_id = $2',
          [usuarioId, copropiedadId],
        );
        const personaId = rows[0]?.persona_id ?? null;
        if (personaId === null) return 'SIN_VINCULO';
        const nombre = `${d.nombres} ${d.apellidos}`.slice(0, 200);
        await c.query(
          `UPDATE public.personas
              SET nombres = $2, apellidos = $3, nombre_completo = $4, fecha_nacimiento = $5::date,
                  tipo_documento = $6::tipo_documento, numero_documento = $7, correo = $8,
                  telefono = $9
            WHERE id = $1`,
          [
            personaId,
            d.nombres,
            d.apellidos,
            nombre,
            d.fechaNacimiento,
            d.tipoDocumento,
            d.numeroDocumento,
            d.correo,
            d.telefono,
          ],
        );
        await c.query('UPDATE public.usuarios SET nombre = $2 WHERE id = $1', [usuarioId, nombre]);
        return 'guardado';
      });
    } catch (e) {
      const { codigo, restriccion } = violacion(e);
      if (codigo === '23505' && restriccion === 'personas_documento_uk') return 'DOCUMENTO_EN_USO';
      throw e;
    }
  }
}

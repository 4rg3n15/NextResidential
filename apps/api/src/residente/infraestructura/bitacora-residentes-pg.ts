import type { Pool } from 'pg';
import type {
  BitacoraDeResidentes,
  CuentaDeResidente,
  CuentasDeResidentes,
  HechoDeResidente,
} from '../aplicacion/puertos-hogar';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import { comoServicio } from './con-identidad';

/** Bitácora de residentes, de solo inserción (0038, ADR-005). */
export class BitacoraDeResidentesPg implements BitacoraDeResidentes {
  constructor(private readonly pool: Pool) {}

  async anotar(h: HechoDeResidente): Promise<void> {
    await comoServicio(this.pool, h.copropiedadId, h.actorId, async (c) => {
      await c.query(
        `INSERT INTO public.bitacora_de_residentes
           (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, vivienda_id, vehiculo_id,
            detalle, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $5)`,
        [
          h.copropiedadId,
          h.ocurridoEn,
          h.tipo,
          h.usuarioId,
          h.actorId,
          h.viviendaId ?? null,
          h.vehiculoId ?? null,
          h.detalle === undefined || h.detalle === null ? null : h.detalle.slice(0, 500),
        ],
      );
    });
  }
}

/** Las cuentas de residente de una copropiedad, para el superadministrador. Sin correo. */
export class CuentasDeResidentesPg implements CuentasDeResidentes {
  constructor(private readonly pool: Pool) {}

  async listar(copropiedadId: string): Promise<readonly CuentaDeResidente[]> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{
        id: string;
        usuario: string | null;
        nombre: string;
        vivienda: string | null;
        activa: boolean;
        debe_cambiar: boolean;
        creado_en: Date;
      }>(
        `SELECT u.id, u.nombre_usuario::text AS usuario, u.nombre,
                (SELECT btrim(coalesce(v.agrupacion || ' · ', '') || v.identificador)
                   FROM public.residentes r JOIN public.viviendas v ON v.id = r.vivienda_id
                  WHERE r.persona_id = u.persona_id AND r.estado = 'activo'
                  ORDER BY r.es_titular DESC, r.creado_en LIMIT 1) AS vivienda,
                u.estado = 'activo' AS activa, u.debe_cambiar_contrasena AS debe_cambiar,
                u.creado_en
           FROM public.usuarios u
          WHERE u.copropiedad_id = $1
            AND EXISTS (SELECT 1 FROM public.roles_usuario ru
                         WHERE ru.usuario_id = u.id AND ru.rol = 'residente'
                           AND ru.estado = 'activo' AND ru.copropiedad_id = $1)
          ORDER BY u.creado_en DESC
          LIMIT 1000`,
        [copropiedadId],
      );
      return rows.map((f) => ({
        usuarioId: f.id,
        usuario: f.usuario,
        nombre: f.nombre,
        vivienda: f.vivienda,
        activa: f.activa,
        debeCambiarContrasena: f.debe_cambiar,
        creadaEn: f.creado_en.toISOString(),
      }));
    });
  }
}

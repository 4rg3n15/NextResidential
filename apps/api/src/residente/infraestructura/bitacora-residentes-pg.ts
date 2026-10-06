import type { Pool } from 'pg';
import type {
  BitacoraDeResidentes,
  CuentaDadaDeBaja,
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
    // 15-W · sin actor humano (un intento de registro anónimo) firma la ingesta.
    const firma = h.actorId ?? ACTOR_INGESTA;
    await comoServicio(this.pool, h.copropiedadId, firma, async (c) => {
      await c.query(
        `INSERT INTO public.bitacora_de_residentes
           (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, vivienda_id, vehiculo_id,
            detalle, creado_por)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          h.copropiedadId,
          h.ocurridoEn,
          h.tipo,
          h.usuarioId,
          h.actorId,
          h.viviendaId ?? null,
          h.vehiculoId ?? null,
          h.detalle === undefined || h.detalle === null ? null : h.detalle.slice(0, 500),
          firma,
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
        origen: 'administracion' | 'autorregistro';
      }>(
        // 15-W · antes del primer ingreso, la vivienda que la cuenta YA trae:
        // la de su titularidad (D1) o la de su plaza (D2).
        `SELECT u.id, u.nombre_usuario::text AS usuario, u.nombre,
                coalesce(
                  (SELECT btrim(coalesce(v.agrupacion || ' · ', '') || v.identificador)
                     FROM public.residentes r JOIN public.viviendas v ON v.id = r.vivienda_id
                    WHERE r.persona_id = u.persona_id AND r.estado = 'activo'
                    ORDER BY r.es_titular DESC, r.creado_en LIMIT 1),
                  (SELECT btrim(coalesce(v.agrupacion || ' · ', '') || v.identificador)
                     FROM public.ocupacion_de_viviendas o JOIN public.viviendas v ON v.id = o.vivienda_id
                    WHERE o.primer_residente_id = u.id LIMIT 1),
                  (SELECT btrim(coalesce(v.agrupacion || ' · ', '') || v.identificador)
                     FROM public.plazas_de_ocupante p JOIN public.viviendas v ON v.id = p.vivienda_id
                    WHERE p.usuario_id = u.id AND p.estado = 'activo' LIMIT 1)) AS vivienda,
                u.estado = 'activo' AS activa, u.debe_cambiar_contrasena AS debe_cambiar,
                u.creado_en, u.origen_de_alta AS origen
           FROM public.usuarios u
          WHERE u.copropiedad_id = $1
            -- C9 (15-M) · también las dadas de baja: el rol queda inactivo
            -- pero la cuenta se enseña «De baja» (RN-19), no desaparece.
            AND EXISTS (SELECT 1 FROM public.roles_usuario ru
                         WHERE ru.usuario_id = u.id AND ru.rol = 'residente'
                           AND ru.copropiedad_id = $1)
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
        origen: f.origen,
      }));
    });
  }

  /**
   * C9 (15-M) · LA BAJA, EN UNA TRANSACCIÓN Y SIN BORRAR NADA (RN-19).
   *
   * Tres `UPDATE` y una constancia: la cuenta (`usuarios`), su rol de
   * residente (`roles_usuario`) y sus vínculos de vivienda (`residentes`).
   * Con la cuenta y el rol inactivos, el gancho de claims de Supabase
   * (`custom_access_token_hook`, 0024) rechaza el siguiente refresco del
   * token: la sesión no sobrevive a los 5 minutos del JWT. Las autorizaciones
   * vigentes NO se tocan (RN-13) y no nacen nuevas porque ya no hay vínculo.
   */
  async darDeBaja(
    copropiedadId: string,
    usuarioId: string,
    motivo: string,
    actorId: string,
  ): Promise<CuentaDadaDeBaja | null> {
    return comoServicio(this.pool, copropiedadId, actorId, async (c) => {
      const { rows } = await c.query<{ id: string; persona_id: string | null; nombre: string }>(
        `UPDATE public.usuarios u
            SET estado = 'inactivo', desactivado_en = now(), desactivado_por = $3,
                motivo_desactivacion = $4, actualizado_por = $3, actualizado_en = now()
          WHERE u.id = $2 AND u.copropiedad_id = $1 AND u.estado = 'activo'
            -- C9 (15-M) · también las dadas de baja: el rol queda inactivo
            -- pero la cuenta se enseña «De baja» (RN-19), no desaparece.
            AND EXISTS (SELECT 1 FROM public.roles_usuario ru
                         WHERE ru.usuario_id = u.id AND ru.rol = 'residente'
                           AND ru.copropiedad_id = $1)
      RETURNING u.id, u.persona_id, u.nombre`,
        [copropiedadId, usuarioId, actorId, motivo],
      );
      const cuenta = rows[0];
      if (cuenta === undefined) return null;
      await c.query(
        `UPDATE public.roles_usuario
            SET estado = 'inactivo', desactivado_en = now(), desactivado_por = $3,
                motivo_desactivacion = $4, actualizado_por = $3, actualizado_en = now()
          WHERE usuario_id = $2 AND copropiedad_id = $1 AND estado = 'activo'`,
        [copropiedadId, usuarioId, actorId, motivo],
      );
      if (cuenta.persona_id !== null) {
        await c.query(
          `UPDATE public.residentes
              SET estado = 'inactivo', desactivado_en = now(), desactivado_por = $3,
                  motivo_desactivacion = $4, actualizado_por = $3, actualizado_en = now()
            WHERE persona_id = $2 AND copropiedad_id = $1 AND estado = 'activo'`,
          [copropiedadId, cuenta.persona_id, actorId, motivo],
        );
      }
      await c.query(
        `INSERT INTO public.auditoria_seguridad
           (copropiedad_id_actor, copropiedad_id_objetivo, usuario_id, tipo, recurso,
            identificador_solicitado, resultado, creado_por)
         VALUES ($1, $1, $2, 'cambio_configuracion', 'residentes/baja', $3, 'permitido', $2)`,
        [copropiedadId, actorId, `${cuenta.nombre} · ${motivo}`.slice(0, 500)],
      );
      return { usuarioId: cuenta.id, personaId: cuenta.persona_id };
    });
  }
}

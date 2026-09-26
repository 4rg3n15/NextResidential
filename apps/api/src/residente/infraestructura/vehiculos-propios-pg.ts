import type { Pool } from 'pg';
import type { AmbitoDelResidente, VehiculoPropioValido } from '@ncr/domain-core';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';
import type {
  AltaDeVehiculo,
  VehiculoPropioGuardado,
  VehiculosPropios,
} from '../aplicacion/puertos-hogar';
import { comoServicio, violacion } from './con-identidad';

/**
 * VEHÍCULOS PROPIOS CONTRA POSTGRESQL (D5 a, ADR-026).
 *
 * No hay un SELECT previo que cuente: el INSERT lleva `origen_registro =
 * 'residente'` y el disparador `tg_tope_vehiculos_propios` —con su bloqueo por
 * vivienda— decide. Su rechazo llega como `23514 vehiculos_tope_propios` y aquí
 * se traduce a un valor de negocio, igual que la placa duplicada (RN-04).
 * El alta, sus ocupantes y su fila en la bitácora van en una transacción.
 */
export class VehiculosPropiosPg implements VehiculosPropios {
  constructor(private readonly pool: Pool) {}

  async cupo(ambito: AmbitoDelResidente) {
    return comoServicio(this.pool, ambito.copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{ tope: number; ocupados: string }>(
        `SELECT c.tope_vehiculos_propios AS tope,
                (SELECT count(*) FROM public.vehiculos v
                  WHERE v.copropiedad_id = c.id AND v.vivienda_id = $2 AND v.estado = 'activo'
                    AND v.origen_registro = 'residente') AS ocupados
           FROM public.copropiedades c WHERE c.id = $1`,
        [ambito.copropiedadId, ambito.viviendaId],
      );
      return { tope: Number(rows[0]?.tope ?? 0), ocupados: Number(rows[0]?.ocupados ?? 0) };
    });
  }

  async ocupantes(ambito: AmbitoDelResidente): Promise<readonly string[]> {
    return comoServicio(this.pool, ambito.copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `SELECT id FROM public.residentes
          WHERE copropiedad_id = $1 AND vivienda_id = $2 AND estado = 'activo'`,
        [ambito.copropiedadId, ambito.viviendaId],
      );
      return rows.map((f) => f.id);
    });
  }

  async registrar(
    ambito: AmbitoDelResidente,
    actorId: string,
    v: VehiculoPropioValido,
  ): Promise<AltaDeVehiculo> {
    try {
      return await comoServicio(this.pool, ambito.copropiedadId, actorId, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO public.vehiculos
             (copropiedad_id, vivienda_id, persona_id, placa, marca, modelo, color, tipo,
              origen_registro, creado_por, actualizado_por)
           VALUES ($1, $2, (SELECT persona_id FROM public.residentes WHERE id = $3), $4, $5, $6, $7,
                   $8::tipo_vehiculo, 'residente', $9, $9)
           RETURNING id`,
          [
            ambito.copropiedadId,
            ambito.viviendaId,
            v.ocupantes[0],
            v.placa,
            v.marca,
            v.modelo,
            v.color,
            v.tipo,
            actorId,
          ],
        );
        const id = rows[0]?.id;
        if (id === undefined) throw new Error('el alta de vehículo no devolvió identificador');
        await c.query(
          `INSERT INTO public.vehiculos_ocupantes
             (copropiedad_id, vehiculo_id, residente_id, creado_por, actualizado_por)
           SELECT $1, $2, r, $4, $4 FROM unnest($3::uuid[]) AS r`,
          [ambito.copropiedadId, id, v.ocupantes, actorId],
        );
        await c.query(
          `INSERT INTO public.bitacora_de_residentes
             (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, vivienda_id, vehiculo_id,
              detalle, creado_por)
           VALUES ($1, now(), 'vehiculo_propio_registrado', $3, $3, $2, $4, $5, $3)`,
          [ambito.copropiedadId, ambito.viviendaId, actorId, id, `placa ${v.placa}`],
        );
        return { ok: true as const, id };
      });
    } catch (e) {
      const { codigo, restriccion } = violacion(e);
      if (codigo === '23514' && restriccion === 'vehiculos_tope_propios') {
        return { ok: false, motivo: 'TOPE_ALCANZADO' };
      }
      if (codigo === '23505' && restriccion === 'vehiculos_placa_activa_uk') {
        return { ok: false, motivo: 'PLACA_DUPLICADA' };
      }
      if (codigo === '23514' && restriccion === 'vehiculos_ocupantes_misma_vivienda') {
        return { ok: false, motivo: 'OCUPANTE_AJENO' };
      }
      throw e;
    }
  }

  async desactivar(ambito: AmbitoDelResidente, vehiculoId: string, actorId: string) {
    return comoServicio(this.pool, ambito.copropiedadId, actorId, async (c) => {
      const { rows } = await c.query<{ placa: string }>(
        `UPDATE public.vehiculos
            SET estado = 'inactivo', desactivado_en = now(), desactivado_por = $4,
                motivo_desactivacion = 'baja por un residente de la vivienda'
          WHERE id = $3 AND copropiedad_id = $1 AND vivienda_id = $2
            AND origen_registro = 'residente' AND estado = 'activo'
          RETURNING placa`,
        [ambito.copropiedadId, ambito.viviendaId, vehiculoId, actorId],
      );
      if (rows[0] === undefined) return false;
      await c.query(
        `INSERT INTO public.bitacora_de_residentes
           (copropiedad_id, ocurrido_en, tipo, usuario_id, actor_id, vivienda_id, vehiculo_id,
            detalle, creado_por)
         VALUES ($1, now(), 'vehiculo_propio_desactivado', $3, $3, $2, $4, $5, $3)`,
        [ambito.copropiedadId, ambito.viviendaId, actorId, vehiculoId, `placa ${rows[0].placa}`],
      );
      return true;
    });
  }

  async registradosPorResidentes(
    copropiedadId: string,
  ): Promise<readonly VehiculoPropioGuardado[]> {
    return comoServicio(this.pool, copropiedadId, ACTOR_INGESTA, async (c) => {
      const { rows } = await c.query<{
        id: string;
        vivienda_id: string;
        vivienda: string;
        placa: string;
        color: string | null;
        modelo: string | null;
        marca: string | null;
        tipo: string;
        creado_en: Date;
        registrado_por: string | null;
        ocupantes: string[];
        activo: boolean;
      }>(
        `SELECT v.id, v.vivienda_id,
                btrim(coalesce(vi.agrupacion || ' · ', '') || vi.identificador) AS vivienda,
                v.placa, v.color, v.modelo, v.marca, v.tipo::text AS tipo, v.creado_en,
                coalesce(u.nombre_usuario::text, u.nombre) AS registrado_por,
                ARRAY(SELECT per.nombre_completo
                        FROM public.vehiculos_ocupantes vo
                        JOIN public.residentes r ON r.id = vo.residente_id
                        JOIN public.personas per ON per.id = r.persona_id
                       WHERE vo.vehiculo_id = v.id AND vo.estado = 'activo'
                       ORDER BY per.nombre_completo) AS ocupantes,
                v.estado = 'activo' AS activo
           FROM public.vehiculos v
           JOIN public.viviendas vi ON vi.id = v.vivienda_id
      LEFT JOIN public.usuarios u ON u.id = v.creado_por
          WHERE v.copropiedad_id = $1 AND v.origen_registro = 'residente'
          ORDER BY v.creado_en DESC
          LIMIT 500`,
        [copropiedadId],
      );
      return rows.map((f) => ({
        id: f.id,
        viviendaId: f.vivienda_id,
        vivienda: f.vivienda,
        placa: f.placa,
        color: f.color,
        modelo: f.modelo,
        marca: f.marca,
        tipo: f.tipo,
        registradoEn: f.creado_en.toISOString(),
        registradoPor: f.registrado_por,
        ocupantes: f.ocupantes,
        activo: f.activo,
      }));
    });
  }
}

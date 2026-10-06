import type { Pool } from 'pg';
import type { AmbitoDelResidente } from '@ncr/domain-core';
import type {
  EdicionDeVehiculo,
  HistorialDeVehiculo,
  ResultadoEdicionVehiculo,
} from '../../padron';
import type {
  EdicionDeVehiculosPropios,
  VehiculosPropiosDeLaVivienda,
} from '../aplicacion/puertos-de-vehiculos-propios';
import { comoServicio, violacion } from './con-identidad';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LOS VEHÍCULOS PROPIOS DE UNA VIVIENDA, CONTRA POSTGRESQL · RONDA 15-W (D5)
 *
 * Cumple la porción del puerto del padrón que usan `editarVehiculoCon` y
 * `borrarVehiculoSinHistorial`, con UN filtro más en cada sentencia: la
 * vivienda del ámbito y `origen_registro = 'residente'`. Escribe como SERVICIO
 * de la copropiedad con el residente como actor. El tope de vehículos sigue en
 * la base (`tg_tope_vehiculos_propios`, 0038) y el borrado definitivo, en
 * `app.borrar_vehiculo_definitivamente` (0034): sólo sin historial.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const PROPIO = `vivienda_id = $3 AND origen_registro = 'residente' AND estado = 'activo'`;

export class EdicionDeVehiculosPropiosPg implements EdicionDeVehiculosPropios {
  constructor(private readonly pool: Pool) {}

  deLaVivienda(ambito: AmbitoDelResidente, actorId: string): VehiculosPropiosDeLaVivienda {
    const { copropiedadId: cop, viviendaId } = ambito;
    return {
      editarVehiculo: (e: EdicionDeVehiculo): Promise<ResultadoEdicionVehiculo> =>
        comoServicio(this.pool, cop, actorId, async (c) => {
          try {
            const { rowCount } = await c.query(
              `UPDATE public.vehiculos
                  SET placa = COALESCE($4, placa),
                      marca = CASE WHEN $5::boolean THEN $6 ELSE marca END,
                      modelo = CASE WHEN $7::boolean THEN $8 ELSE modelo END,
                      color = CASE WHEN $9::boolean THEN $10 ELSE color END,
                      actualizado_en = now(), actualizado_por = $11
                WHERE copropiedad_id = $1 AND id = $2 AND ${PROPIO}`,
              [
                cop,
                e.vehiculoId,
                viviendaId,
                e.placa?.valor ?? null,
                e.marca !== undefined,
                e.marca ?? null,
                e.modelo !== undefined,
                e.modelo ?? null,
                e.color !== undefined,
                e.color ?? null,
                actorId,
              ],
            );
            return (rowCount ?? 0) > 0 ? { tipo: 'editado' } : { tipo: 'no_encontrado' };
          } catch (error) {
            if (violacion(error).codigo === '23505') return { tipo: 'placa_activa_duplicada' };
            throw error;
          }
        }),
      historialDeVehiculo: (
        _cop: string,
        vehiculoId: string,
      ): Promise<HistorialDeVehiculo | null> =>
        comoServicio(this.pool, cop, actorId, async (c) => {
          const { rows } = await c.query<{
            placa: string;
            eventos: string;
            autorizaciones: string;
          }>(
            `SELECT ve.placa,
                    (SELECT count(*) FROM public.eventos e
                      WHERE e.copropiedad_id = ve.copropiedad_id AND e.placa_detectada = ve.placa)::text AS eventos,
                    (SELECT count(*) FROM public.autorizaciones a
                      WHERE a.copropiedad_id = ve.copropiedad_id AND a.placa = ve.placa)::text AS autorizaciones
               FROM public.vehiculos ve
              WHERE ve.copropiedad_id = $1 AND ve.id = $2 AND ve.vivienda_id = $3
                AND ve.origen_registro = 'residente' AND ve.estado = 'activo'`,
            [cop, vehiculoId, viviendaId],
          );
          const f = rows[0];
          return f === undefined
            ? null
            : {
                placa: f.placa,
                eventos: Number(f.eventos),
                autorizaciones: Number(f.autorizaciones),
              };
        }),
      borrarVehiculoDefinitivamente: (_cop: string, vehiculoId: string) =>
        comoServicio(this.pool, cop, actorId, async (c) => {
          // Bajo bloqueo de fila: sigue siendo propio de ESTA vivienda al borrarlo.
          const propio = await c.query(
            `SELECT 1 FROM public.vehiculos WHERE copropiedad_id = $1 AND id = $2 AND ${PROPIO}
              FOR UPDATE`,
            [cop, vehiculoId, viviendaId],
          );
          if ((propio.rowCount ?? 0) === 0)
            return { borrado: false, motivo: 'Vehículo no encontrado' };
          try {
            await c.query('SELECT app.borrar_vehiculo_definitivamente($1, $2, $3)', [
              cop,
              vehiculoId,
              actorId,
            ]);
            return { borrado: true };
          } catch (error) {
            const codigo = violacion(error).codigo;
            if (codigo === '2BP01' || codigo === '23001' || codigo === 'P0002') {
              return { borrado: false, motivo: (error as Error).message };
            }
            throw error;
          }
        }),
    };
  }

  async reemplazarOcupantes(
    ambito: AmbitoDelResidente,
    vehiculoId: string,
    residenteIds: readonly string[],
    actorId: string,
  ): Promise<boolean> {
    return comoServicio(this.pool, ambito.copropiedadId, actorId, async (c) => {
      const propio = await c.query(
        `SELECT 1 FROM public.vehiculos WHERE copropiedad_id = $1 AND id = $2 AND ${PROPIO}`,
        [ambito.copropiedadId, vehiculoId, ambito.viviendaId],
      );
      if ((propio.rowCount ?? 0) === 0) return false;
      await c.query(
        `UPDATE public.vehiculos_ocupantes SET estado = 'inactivo', desactivado_en = now(),
                desactivado_por = $3, motivo_desactivacion = 'ocupantes editados por un residente'
          WHERE copropiedad_id = $1 AND vehiculo_id = $2 AND estado = 'activo'
            AND NOT (residente_id = ANY($4::uuid[]))`,
        [ambito.copropiedadId, vehiculoId, actorId, residenteIds],
      );
      await c.query(
        `INSERT INTO public.vehiculos_ocupantes
           (copropiedad_id, vehiculo_id, residente_id, creado_por, actualizado_por)
         SELECT $1, $2, r, $3, $3 FROM unnest($4::uuid[]) AS r
          WHERE NOT EXISTS (SELECT 1 FROM public.vehiculos_ocupantes vo
                             WHERE vo.vehiculo_id = $2 AND vo.residente_id = r AND vo.estado = 'activo')`,
        [ambito.copropiedadId, vehiculoId, actorId, residenteIds],
      );
      return true;
    });
  }
}

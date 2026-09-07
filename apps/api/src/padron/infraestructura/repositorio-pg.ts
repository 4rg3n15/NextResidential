import type { Pool } from 'pg';
import type { PoolClient } from 'pg';
import { Injectable } from '@nestjs/common';
import type {
  AltaResidente,
  AltaVehiculo,
  RepositorioPadron,
  ResultadoRegistroVehiculo,
} from '../aplicacion/puertos';
import type { Placa } from '@ncr/domain-core';

/** Violación de restricción única en PostgreSQL. */
const VIOLACION_UNICA = '23505';

type Ejecutor = Pool | PoolClient;

/**
 * Adaptador PostgreSQL del padrón.
 *
 * Dos decisiones que sostienen ADR-04 y hay que leer juntas:
 *
 * 1. **No hay `SELECT` previo para comprobar si la placa existe.** Se INSERTA y
 *    se deja que el índice único parcial decida. Un `SELECT`-luego-`INSERT` es
 *    correcto en pruebas secuenciales y falso bajo concurrencia: entre las dos
 *    sentencias caben otras cien. KPI-03 exige 0 duplicados en 100 inserciones
 *    simultáneas, y solo la base puede garantizarlo.
 * 2. **`23505` se traduce a un valor de negocio, no se propaga.** El caso de
 *    uso no debe saber qué es un código SQLSTATE.
 *
 * Cada operación fija `request.jwt.claims` en la MISMA conexión que ejecuta la
 * sentencia: las políticas RLS leen esa variable de sesión, y usar el pool sin
 * fijarla dejaría las consultas sin contexto de tenant.
 */
@Injectable()
export class RepositorioPadronPg implements RepositorioPadron {
  constructor(
    private readonly pool: Pool,
    private readonly claims: Record<string, unknown>,
    private readonly ejecutor: Ejecutor = pool,
  ) {}

  private async conContexto<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    if ('release' in this.ejecutor) {
      // Ya estamos dentro de una transacción con su contexto fijado.
      return fn(this.ejecutor as PoolClient);
    }
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claims),
      ]);
      return await fn(cliente);
    } finally {
      cliente.release();
    }
  }

  async registrarVehiculo(alta: AltaVehiculo): Promise<ResultadoRegistroVehiculo> {
    return this.conContexto(async (c) => {
      try {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO public.vehiculos
             (copropiedad_id, vivienda_id, persona_id, placa, marca, modelo, color,
              creado_por, actualizado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
           RETURNING id`,
          [
            alta.copropiedadId,
            alta.viviendaId,
            alta.personaId,
            alta.placa.valor,
            alta.marca ?? null,
            alta.modelo ?? null,
            alta.color ?? null,
            alta.actorId,
          ],
        );
        return { tipo: 'registrado', id: rows[0]!.id };
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          (e as { code?: string }).code === VIOLACION_UNICA
        ) {
          return { tipo: 'placa_activa_duplicada' };
        }
        throw e;
      }
    });
  }

  async desactivarVehiculo(
    copropiedadId: string,
    vehiculoId: string,
    motivo: string,
    actorId: string,
  ): Promise<boolean> {
    return this.conContexto(async (c) => {
      // Baja LÓGICA (RN-19). No existe `DELETE` en este adaptador, y no es un
      // olvido: la migración 0015 revoca `DELETE` a todos los roles, así que
      // escribirlo produciría un fallo de permisos en vez de un borrado.
      const { rowCount } = await c.query(
        `UPDATE public.vehiculos
            SET estado='inactivo', desactivado_en=now(), desactivado_por=$4,
                motivo_desactivacion=$3, actualizado_por=$4
          WHERE copropiedad_id=$1 AND id=$2 AND estado='activo'`,
        [copropiedadId, vehiculoId, motivo, actorId],
      );
      return (rowCount ?? 0) > 0;
    });
  }

  async registrarResidente(alta: AltaResidente): Promise<{ id: string } | null> {
    return this.conContexto(async (c) => {
      try {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO public.residentes
             (copropiedad_id, vivienda_id, persona_id, es_titular, parentesco,
              creado_por, actualizado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$6)
           RETURNING id`,
          [
            alta.copropiedadId,
            alta.viviendaId,
            alta.personaId,
            alta.esTitular,
            alta.parentesco ?? null,
            alta.actorId,
          ],
        );
        return { id: rows[0]!.id };
      } catch (e) {
        if (
          typeof e === 'object' &&
          e !== null &&
          (e as { code?: string }).code === VIOLACION_UNICA
        ) {
          return null;
        }
        throw e;
      }
    });
  }

  async desactivarVivienda(
    copropiedadId: string,
    viviendaId: string,
    motivo: string,
    actorId: string,
  ): Promise<boolean> {
    return this.conContexto(async (c) => {
      const { rowCount } = await c.query(
        `UPDATE public.viviendas
            SET estado='inactivo', desactivado_en=now(), desactivado_por=$4,
                motivo_desactivacion=$3, actualizado_por=$4
          WHERE copropiedad_id=$1 AND id=$2 AND estado='activo'`,
        [copropiedadId, viviendaId, motivo, actorId],
      );
      return (rowCount ?? 0) > 0;
    });
  }

  async contarVehiculosActivos(copropiedadId: string, placa: Placa): Promise<number> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM public.vehiculos
          WHERE copropiedad_id=$1 AND placa=$2 AND estado='activo'`,
        [copropiedadId, placa.valor],
      );
      return Number(rows[0]?.n ?? '0');
    });
  }

  /**
   * Carga transaccional: o entra el padrón entero o no entra nada. Una carga a
   * medias deja al administrador sin saber qué filas quedaron dentro, y
   * reintentar duplicaría las que sí pasaron.
   */
  async enTransaccion<T>(operacion: (repo: RepositorioPadron) => Promise<T>): Promise<T> {
    const cliente = await this.pool.connect();
    try {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(this.claims),
      ]);
      await cliente.query('BEGIN');
      const resultado = await operacion(new RepositorioPadronPg(this.pool, this.claims, cliente));
      await cliente.query('COMMIT');
      return resultado;
    } catch (e) {
      await cliente.query('ROLLBACK');
      throw e;
    } finally {
      cliente.release();
    }
  }
}

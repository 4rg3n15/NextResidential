import type { Pool, PoolClient } from 'pg';
import type { SalidaAplanada } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import { conCliente } from '../../persistencia/con-cliente';
import type { PuntoDeAcceso, RepositorioDePuntos } from '../aplicacion/puntos-de-acceso';

/**
 * 15-P · P3 · los puntos de acceso en PostgreSQL (`puntos_de_acceso`, 0048).
 *
 * Con los claims del USUARIO, no de servicio: escribir salidas es administrar
 * el equipo y la RLS lo exige (administrador o superadministrador); leerlas
 * para abrir, también por la RLS (`puede_leer_operacion`). La unicidad de la
 * puerta activa por equipo es del índice parcial (ADR-04): dos «Descubrir» a
 * la vez no duplican nada, el segundo choca y no inserta.
 */
interface FilaPunto {
  readonly id: string;
  readonly dispositivo_id: string;
  readonly nombre: string;
  readonly numero_de_puerta: number;
  readonly modulo: string | null;
  readonly ruta_en_el_equipo: string | null;
  readonly origen: 'descubierto' | 'manual';
  readonly descubierto_en: Date | null;
}

const CAMPOS =
  'id, dispositivo_id, nombre, numero_de_puerta, modulo, ruta_en_el_equipo, origen, descubierto_en';

const aPunto = (f: FilaPunto): PuntoDeAcceso => ({
  id: f.id,
  dispositivoId: f.dispositivo_id,
  nombre: f.nombre,
  numeroDePuerta: f.numero_de_puerta,
  modulo: f.modulo,
  rutaEnElEquipo: f.ruta_en_el_equipo,
  origen: f.origen,
  descubiertoEn: f.descubierto_en,
});

const ACTIVOS = `copropiedad_id = $1 AND dispositivo_id = $2 AND estado = 'activo'
  AND numero_de_puerta IS NOT NULL`;

export class RepositorioDePuntosPg implements RepositorioDePuntos {
  constructor(private readonly pool: Pool) {}

  private async comoUsuario<T>(ctx: ContextoTenant, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return conCliente(this.pool, async (cliente) => {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({
          rol: ctx.rol,
          usuario_id: ctx.usuarioId,
          copropiedad_id: ctx.copropiedadId,
          copropiedades: ctx.copropiedadesAtendidas,
        }),
      ]);
      return await fn(cliente);
    });
  }

  private static async activos(
    c: PoolClient,
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<readonly PuntoDeAcceso[]> {
    const { rows } = await c.query<FilaPunto>(
      `SELECT ${CAMPOS} FROM public.puntos_de_acceso WHERE ${ACTIVOS} ORDER BY numero_de_puerta`,
      [copropiedadId, dispositivoId],
    );
    return rows.map(aPunto);
  }

  async listar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
  ): Promise<readonly PuntoDeAcceso[]> {
    return this.comoUsuario(ctx, (c) =>
      RepositorioDePuntosPg.activos(c, copropiedadId, dispositivoId),
    );
  }

  async sincronizar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    salidas: readonly SalidaAplanada[],
    ahora: Date,
  ): Promise<readonly PuntoDeAcceso[]> {
    const puertas = salidas.map((s) => s.numeroDePuerta);
    return this.comoUsuario(ctx, async (c) => {
      await c.query('BEGIN');
      try {
        // Lo que el equipo ya no declara: baja lógica, con motivo (RN-19).
        await c.query(
          `UPDATE public.puntos_de_acceso
              SET estado = 'inactivo', desactivado_en = $3, desactivado_por = $4,
                  motivo_desactivacion = 'El equipo dejó de declarar esta salida'
            WHERE ${ACTIVOS} AND origen = 'descubierto' AND NOT (numero_de_puerta = ANY($5::int[]))`,
          [copropiedadId, dispositivoId, ahora, ctx.usuarioId, puertas],
        );
        for (const s of salidas) {
          // Lo que sigue: módulo, ruta y fecha de lectura al día; el NOMBRE no se toca.
          const { rowCount } = await c.query(
            `UPDATE public.puntos_de_acceso
                SET modulo = $4, ruta_en_el_equipo = $5, descubierto_en = $6
              WHERE ${ACTIVOS} AND numero_de_puerta = $3`,
            [copropiedadId, dispositivoId, s.numeroDePuerta, s.modulo, s.ruta, ahora],
          );
          if ((rowCount ?? 0) > 0) continue;
          await c.query(
            `INSERT INTO public.puntos_de_acceso
               (copropiedad_id, dispositivo_id, nombre, tipo, numero_de_puerta, modulo,
                ruta_en_el_equipo, origen, descubierto_en, creado_por, actualizado_por)
             VALUES ($1, $2, $3, 'puerta', $4, $5, $6, 'descubierto', $7, $8, $8)
             ON CONFLICT (copropiedad_id, dispositivo_id, numero_de_puerta)
               WHERE estado = 'activo' AND numero_de_puerta IS NOT NULL DO NOTHING`,
            [
              copropiedadId,
              dispositivoId,
              s.nombre,
              s.numeroDePuerta,
              s.modulo,
              s.ruta,
              ahora,
              ctx.usuarioId,
            ],
          );
        }
        const resultado = await RepositorioDePuntosPg.activos(c, copropiedadId, dispositivoId);
        await c.query('COMMIT');
        return resultado;
      } catch (error) {
        await c.query('ROLLBACK');
        throw error;
      }
    });
  }

  async renombrar(
    ctx: ContextoTenant,
    copropiedadId: string,
    dispositivoId: string,
    puntoId: string,
    nombre: string,
  ): Promise<PuntoDeAcceso | null> {
    return this.comoUsuario(ctx, async (c) => {
      const { rows } = await c.query<FilaPunto>(
        `UPDATE public.puntos_de_acceso SET nombre = $4
          WHERE ${ACTIVOS} AND id = $3 RETURNING ${CAMPOS}`,
        [copropiedadId, dispositivoId, puntoId, nombre],
      );
      const fila = rows[0];
      return fila === undefined ? null : aPunto(fila);
    });
  }
}

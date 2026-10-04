import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AmbitoDelResidente } from '@ncr/domain-core';
import type { SuscripcionDelNavegador, SuscripcionesDelNavegador } from '../aplicacion/avisos-web';
import { claimsDeServicio } from '../../comun/claims-de-servicio';
import { conCliente } from '../../persistencia/con-cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA SUSCRIPCIÓN DEL NAVEGADOR, EN `dispositivos_de_notificacion` · 15-R, B3
 *
 * La fila se identifica como siempre por `instalacion_id`; para un navegador
 * es `web:` + el SHA-256 del endpoint: el mismo navegador que vuelve a
 * suscribirse actualiza su fila en vez de sumar otra, y no hay que guardar
 * nada en el navegador para saberlo.
 *
 * Con los claims de servicio DE LA COPROPIEDAD del ámbito (la API ya resolvió
 * quién y de qué vivienda): son los claims reales del tenant, la RLS forzada
 * sigue acotando a esa copropiedad, y permiten el traspaso de abajo.
 *
 * Traspaso: si el mismo navegador estaba suscrito por OTRA cuenta del mismo
 * conjunto (un computador compartido), esa fila se da de baja en la misma
 * transacción: los avisos de una casa no siguen llegando a la pantalla de
 * otra persona. Si la otra cuenta es de OTRO conjunto, la RLS no deja verla y
 * el índice único de la 0052 rechaza el alta: se responde «de otra cuenta».
 * ═════════════════════════════════════════════════════════════════════════════
 */
const instalacionDe = (endpoint: string): string =>
  `web:${createHash('sha256').update(endpoint).digest('hex').slice(0, 40)}`;

const esUnicoViolado = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

export class SuscripcionesDelNavegadorPg implements SuscripcionesDelNavegador {
  constructor(private readonly pool: Pool) {}

  async suscribir(
    ambito: AmbitoDelResidente,
    usuarioId: string,
    s: SuscripcionDelNavegador,
  ): Promise<{ readonly id: string } | 'endpoint_de_otra_cuenta'> {
    const instalacion = instalacionDe(s.endpoint);
    return this.conServicio(ambito.copropiedadId, async (c) => {
      await c.query('BEGIN');
      try {
        await c.query(
          `UPDATE public.dispositivos_de_notificacion
              SET estado = 'inactivo', desactivado_en = now(),
                  motivo_de_baja = 'el navegador pasó a otra cuenta',
                  actualizado_en = now(), actualizado_por = $4
            WHERE copropiedad_id = $1 AND plataforma = 'web' AND estado = 'activo'
              AND md5(token) = md5($2) AND NOT (usuario_id = $4 AND instalacion_id = $3)`,
          [ambito.copropiedadId, s.endpoint, instalacion, usuarioId],
        );
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO public.dispositivos_de_notificacion
             (copropiedad_id, usuario_id, instalacion_id, token, plataforma, vivienda_id,
              clave_p256dh, clave_auth, creado_por, actualizado_por)
           VALUES ($1, $2, $3, $4, 'web', $5, $6, $7, $2, $2)
           ON CONFLICT (copropiedad_id, usuario_id, instalacion_id) DO UPDATE
             SET token = EXCLUDED.token, plataforma = 'web',
                 vivienda_id = EXCLUDED.vivienda_id,
                 clave_p256dh = EXCLUDED.clave_p256dh, clave_auth = EXCLUDED.clave_auth,
                 estado = 'activo', desactivado_en = NULL, motivo_de_baja = NULL,
                 visto_en = now(), actualizado_en = now(),
                 actualizado_por = EXCLUDED.actualizado_por
           RETURNING id`,
          [
            ambito.copropiedadId,
            usuarioId,
            instalacion,
            s.endpoint,
            ambito.viviendaId,
            s.p256dh,
            s.auth,
          ],
        );
        await c.query('COMMIT');
        const id = rows[0]?.id;
        if (id === undefined) throw new Error('no se pudo registrar la suscripción');
        return { id };
      } catch (error) {
        await c.query('ROLLBACK');
        if (esUnicoViolado(error)) return 'endpoint_de_otra_cuenta';
        throw error;
      }
    });
  }

  async anular(ambito: AmbitoDelResidente, usuarioId: string, endpoint: string): Promise<boolean> {
    return this.conServicio(ambito.copropiedadId, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE public.dispositivos_de_notificacion
            SET estado = 'inactivo', desactivado_en = now(),
                motivo_de_baja = 'el residente quitó los avisos de este navegador',
                actualizado_en = now(), actualizado_por = $2
          WHERE copropiedad_id = $1 AND usuario_id = $2 AND plataforma = 'web'
            AND estado = 'activo' AND token = $3`,
        [ambito.copropiedadId, usuarioId, endpoint],
      );
      return (rowCount ?? 0) > 0;
    });
  }

  private async conServicio<T>(
    copropiedadId: string,
    fn: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    return conCliente(this.pool, async (cliente) => {
      await cliente.query("SELECT set_config('request.jwt.claims', $1, false)", [
        JSON.stringify(claimsDeServicio(copropiedadId)),
      ]);
      return await fn(cliente);
    });
  }
}

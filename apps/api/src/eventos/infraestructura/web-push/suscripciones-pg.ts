import type { Pool, PoolClient } from 'pg';
import { claimsDeServicio } from '../../../comun/claims-de-servicio';
import { ACTOR_INGESTA } from '../../../comun/actores-de-servicio';
import { conCliente } from '../../../persistencia/con-cliente';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A QUIÉN LE LLEGA EL AVISO DE UNA VIVIENDA · 15-R, bloque B3
 *
 * Las suscripciones son filas de `dispositivos_de_notificacion` (0030, la
 * misma tabla de `/mi/notificaciones/aparatos`, ampliada en la 0052) con
 * plataforma `web` y sus dos llaves. El aislamiento es doble:
 *
 *  · copropiedad: se lee con los claims de servicio DE ESA copropiedad, así
 *    que la RLS forzada no devuelve filas de otra aunque la consulta errara;
 *  · vivienda: la fila guarda la vivienda que la API resolvió al suscribir (no
 *    la que dijo el cliente), Y se exige que su dueño SIGA siendo residente
 *    activo de ella. Quien se muda deja de recibir los avisos de su antigua
 *    casa aunque su navegador siga suscrito.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface SuscripcionWebPush {
  readonly id: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface SuscripcionesWebPush {
  deVivienda(copropiedadId: string, viviendaId: string): Promise<readonly SuscripcionWebPush[]>;
  /** El servicio dijo 404/410: la suscripción ya no existe. Baja lógica, nunca DELETE. */
  retirar(copropiedadId: string, id: string, motivo: string): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class SuscripcionesWebPushPg implements SuscripcionesWebPush {
  constructor(private readonly pool: Pool) {}

  async deVivienda(
    copropiedadId: string,
    viviendaId: string,
  ): Promise<readonly SuscripcionWebPush[]> {
    // `EscalarAlerta` nombra a la guardia como «vivienda»: no hay residentes ahí.
    if (!UUID.test(viviendaId) || !UUID.test(copropiedadId)) return [];
    return this.conServicio(copropiedadId, async (c) => {
      const { rows } = await c.query<{
        id: string;
        endpoint: string;
        p256dh: string;
        auth: string;
      }>(
        `SELECT d.id, d.token AS endpoint, d.clave_p256dh AS p256dh, d.clave_auth AS auth
           FROM public.dispositivos_de_notificacion d
           JOIN public.usuarios u ON u.id = d.usuario_id AND u.estado = 'activo'
          WHERE d.copropiedad_id = $1 AND d.vivienda_id = $2
            AND d.plataforma = 'web' AND d.estado = 'activo'
            AND d.clave_p256dh IS NOT NULL AND d.clave_auth IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.residentes r
               WHERE r.copropiedad_id = d.copropiedad_id AND r.vivienda_id = d.vivienda_id
                 AND r.persona_id = u.persona_id AND r.estado = 'activo')`,
        [copropiedadId, viviendaId],
      );
      return rows;
    });
  }

  async retirar(copropiedadId: string, id: string, motivo: string): Promise<void> {
    await this.conServicio(copropiedadId, async (c) => {
      await c.query(
        `UPDATE public.dispositivos_de_notificacion
            SET estado = 'inactivo', desactivado_en = now(), motivo_de_baja = $3,
                actualizado_en = now(), actualizado_por = $4
          WHERE copropiedad_id = $1 AND id = $2 AND estado = 'activo'`,
        [copropiedadId, id, motivo.slice(0, 200), ACTOR_INGESTA],
      );
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

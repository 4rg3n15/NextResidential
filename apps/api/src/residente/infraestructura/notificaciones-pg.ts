import { Injectable } from '@nestjs/common';
import { BaseDelResidentePg } from './base-pg';
import type { NotificacionesDelResidente } from '../aplicacion/puertos';

/**
 * M-7 · HU-34 · El token de notificaciones de ESTE aparato.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ES UN `UPSERT` POR APARATO, NO UN `INSERT`
 *
 * El token de FCM **rota solo**: caduca, cambia al reinstalar, cambia al
 * restaurar una copia de seguridad. La app lo registra cada vez que arranca, y
 * si cada registro insertara una fila, en un mes habría veinte filas del mismo
 * teléfono y se enviarían veinte notificaciones —diecinueve a tokens muertos—
 * por cada aviso.
 *
 * Por eso la identidad de la fila es `instalacion_id`, que la app genera una
 * vez y guarda: el token es el dato que cambia, no la clave.
 *
 * `visto_en` se refresca en cada alta. Es lo que permitirá a la ETAPA 14 dar de
 * baja los aparatos que llevan meses sin aparecer, en vez de acumularlos.
 */
@Injectable()
export class NotificacionesDelResidentePg
  extends BaseDelResidentePg
  implements NotificacionesDelResidente
{
  async registrarToken(
    copropiedadId: string,
    usuarioId: string,
    aparato: {
      readonly instalacionId: string;
      readonly token: string;
      readonly plataforma: 'ios' | 'android' | 'web';
    },
  ): Promise<{ readonly id: string }> {
    return this.conContexto(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO public.dispositivos_de_notificacion
           (copropiedad_id, usuario_id, instalacion_id, token, plataforma,
            creado_por, actualizado_por)
         VALUES ($1, $2, $3, $4, $5, $2, $2)
         ON CONFLICT (copropiedad_id, usuario_id, instalacion_id) DO UPDATE
           SET token = EXCLUDED.token,
               plataforma = EXCLUDED.plataforma,
               estado = 'activo',
               desactivado_en = NULL,
               visto_en = now(),
               actualizado_en = now(),
               actualizado_por = EXCLUDED.actualizado_por
         RETURNING id`,
        [copropiedadId, usuarioId, aparato.instalacionId, aparato.token, aparato.plataforma],
      );
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('no se pudo registrar el aparato');
      return { id };
    });
  }
}

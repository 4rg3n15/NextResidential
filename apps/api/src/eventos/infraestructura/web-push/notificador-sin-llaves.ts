import type { Bitacora } from '@ncr/domain-core';
import type { NotificadorPush } from '../../aplicacion/puertos';

/**
 * 15-R · B1 · el notificador EXPLÍCITO de un despliegue sin llaves VAPID.
 *
 * Devuelve 0 —«no le llegó a nadie»— y lo deja en la bitácora en cada aviso,
 * además del aviso del arranque. Es lo contrario del provisional de la ETAPA 06,
 * que devolvía 1 sin enviar nada: con este, la consola de la guardia dice la
 * verdad («no le llega a la app del residente») y pide avisar por teléfono.
 */
export class NotificadorPushSinLlaves implements NotificadorPush {
  constructor(private readonly bitacora: Bitacora) {}

  async aVivienda(copropiedadId: string, viviendaId: string, titulo: string): Promise<number> {
    this.bitacora.registrar('aviso', 'aviso al residente NO enviado: Web Push sin llaves VAPID', {
      copropiedadId,
      viviendaId,
      titulo,
      remedio: 'docs/guias/AVISOS_WEB_PUSH.md',
    });
    return Promise.resolve(0);
  }
}

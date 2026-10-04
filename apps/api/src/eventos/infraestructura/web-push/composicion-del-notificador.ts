import type { FactoryProvider } from '@nestjs/common';
import { Pool } from 'pg';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import { CONFIGURACION } from '../../../configuracion/configuracion.module';
import type { Configuracion } from '../../../configuracion/esquema';
import {
  SERVICIOS_DE_PUSH_POR_OMISION,
  TTL_POR_OMISION,
} from '../../../configuracion/esquema-de-avisos';
import { NOTIFICADOR_PUSH } from '../../aplicacion/puertos';
import type { NotificadorPush } from '../../aplicacion/puertos';
import { NotificadorWebPush } from './notificador-web-push';
import { NotificadorPushSinLlaves } from './notificador-sin-llaves';
import { esServicioDePushPermitido } from '../../../comun/servicios-de-push';
import { SuscripcionesWebPushPg } from './suscripciones-pg';
import { FirmaVapid } from './vapid';

/** Lo que tarda como mucho un servicio de push en contestar. */
const PLAZO_DEL_SERVICIO_MS = 10_000;

/**
 * 15-R · B1/B2 · con las tres variables VAPID, Web Push de verdad; sin ellas,
 * el notificador que devuelve 0. El arranque dice cuál quedó activo: un
 * despliegue que creyera tener avisos y no los tuviera es el fallo que esto
 * existe para evitar.
 */
export const PROVEEDOR_DEL_NOTIFICADOR_PUSH: FactoryProvider<NotificadorPush> = {
  provide: NOTIFICADOR_PUSH,
  inject: [CONFIGURACION, Pool, BITACORA, RELOJ],
  useFactory: (c: Configuracion, pool: Pool, bitacora: Bitacora, reloj: Reloj) => {
    const publica = c.WEB_PUSH_VAPID_PUBLICA;
    const privada = c.WEB_PUSH_VAPID_PRIVADA;
    const sujeto = c.WEB_PUSH_SUJETO;
    if (publica === undefined || privada === undefined || sujeto === undefined) {
      bitacora.registrar('aviso', 'avisos al residente DESACTIVADOS: faltan las llaves VAPID', {
        consecuencia: 'ningún aviso llega al residente; la guardia lo ve y avisa por teléfono',
        remedio: 'docs/guias/AVISOS_WEB_PUSH.md',
      });
      return new NotificadorPushSinLlaves(bitacora);
    }
    const produccion = c.NODE_ENV === 'production';
    const servicios = c.WEB_PUSH_SERVICIOS_PERMITIDOS ?? SERVICIOS_DE_PUSH_POR_OMISION;
    const ttlSegundos = c.WEB_PUSH_TTL_SEGUNDOS ?? TTL_POR_OMISION;
    bitacora.registrar('info', 'avisos al residente por Web Push (VAPID)', {
      servicios,
      ttlSegundos,
    });
    return new NotificadorWebPush(
      new SuscripcionesWebPushPg(pool),
      new FirmaVapid({ publica, privada, sujeto }),
      {
        permitido: (e) => esServicioDePushPermitido(e, servicios, produccion),
        enviar: (url, init) => fetch(url, init),
        reloj,
        bitacora,
        ttlSegundos,
        plazoMs: PLAZO_DEL_SERVICIO_MS,
      },
    );
  },
};

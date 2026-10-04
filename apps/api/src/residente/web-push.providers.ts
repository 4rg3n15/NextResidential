import type { Provider } from '@nestjs/common';
import { Pool } from 'pg';
import { CONFIGURACION } from '../configuracion/configuracion.module';
import type { Configuracion } from '../configuracion/esquema';
import { SERVICIOS_DE_PUSH_POR_OMISION } from '../configuracion/esquema-de-avisos';
import { esServicioDePushPermitido } from '../comun/servicios-de-push';
import {
  AvisosWebDelResidente,
  POLITICA_DE_AVISOS_WEB,
  SUSCRIPCIONES_DEL_NAVEGADOR,
} from './aplicacion/avisos-web';
import type { PoliticaDeAvisosWeb, SuscripcionesDelNavegador } from './aplicacion/avisos-web';
import { ResolverMiAmbito } from './aplicacion/casos-de-uso';
import { SuscripcionesDelNavegadorPg } from './infraestructura/suscripciones-del-navegador-pg';

/**
 * 15-R · B3 · las piezas de la suscripción Web Push del residente. Fuera de
 * `residente.module.ts` para que el módulo no crezca: se esparcen allí.
 *
 * La política sale de la MISMA configuración que usa el emisor: la llave que
 * la consola recibe es la que firma, y la lista blanca que acepta un endpoint
 * al suscribir es la que lo deja salir al enviar.
 */
export const PROVEEDORES_DE_WEB_PUSH: Provider[] = [
  {
    provide: SUSCRIPCIONES_DEL_NAVEGADOR,
    inject: [Pool],
    useFactory: (pool: Pool) => new SuscripcionesDelNavegadorPg(pool),
  },
  {
    provide: POLITICA_DE_AVISOS_WEB,
    inject: [CONFIGURACION],
    useFactory: (c: Configuracion): PoliticaDeAvisosWeb => {
      const servicios = c.WEB_PUSH_SERVICIOS_PERMITIDOS ?? SERVICIOS_DE_PUSH_POR_OMISION;
      const listas =
        c.WEB_PUSH_VAPID_PUBLICA !== undefined &&
        c.WEB_PUSH_VAPID_PRIVADA !== undefined &&
        c.WEB_PUSH_SUJETO !== undefined;
      return {
        clavePublica: listas ? (c.WEB_PUSH_VAPID_PUBLICA ?? null) : null,
        permitido: (e) => esServicioDePushPermitido(e, servicios, c.NODE_ENV === 'production'),
      };
    },
  },
  {
    provide: AvisosWebDelResidente,
    inject: [ResolverMiAmbito, SUSCRIPCIONES_DEL_NAVEGADOR, POLITICA_DE_AVISOS_WEB],
    useFactory: (r: ResolverMiAmbito, s: SuscripcionesDelNavegador, p: PoliticaDeAvisosWeb) =>
      new AvisosWebDelResidente(r, s, p),
  },
];

import type { CapacidadesDeEquipo } from '../nucleo/capacidades';
import { soporta } from '../nucleo/capacidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * DOS FORMAS DE MANTENER EL FLUJO ABIERTO · 6.5, ETAPA 15-D
 *
 * · `alertStream` — un GET que el equipo mantiene abierto y por el que vuelca
 *   TODO, historial incluido. Es el que existía.
 * · `subscribeEvent` — un POST con un cuerpo que dice qué eventos se quieren.
 *   Los dos equipos reales declaran `isSupportSubscribeEvent=true`. Que el
 *   volcado histórico también venga por aquí es lo que se confirma en sitio.
 *
 * Cuál se usa lo decide la CAPACIDAD del equipo (`transporteSegunCapacidades`),
 * no su tipo ni su marca. El filtrado de lo histórico es el mismo para los dos:
 * la trampa de la puesta en marcha no depende del transporte.
 */
export type TransporteDeFlujo = 'alertStream' | 'subscribeEvent';

export const transporteSegunCapacidades = (capacidades: CapacidadesDeEquipo): TransporteDeFlujo =>
  soporta(capacidades, 'suscripcionDeEventos') ? 'subscribeEvent' : 'alertStream';

/**
 * Lo que se pide al suscribirse. DOCUMENTADO, NO VERIFICADO: la forma del
 * cuerpo sale de la documentación de suscripción del fabricante. `all` para
 * que el filtrado lo haga el sistema —que sabe qué clases usa— y no un
 * firmware cuyo vocabulario de tipos varía por modelo.
 */
export const CUERPO_DE_SUSCRIPCION =
  '<?xml version="1.0" encoding="UTF-8"?><SubscribeEvent version="2.0" ' +
  'xmlns="http://www.isapi.org/ver20/XMLSchema"><eventMode>all</eventMode></SubscribeEvent>';

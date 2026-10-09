import { codecsDeLaOferta, decidirViaDeVideo, fraseDeVideoNoReproducible } from '@ncr/providers';
import type { ReglaDeVideo } from '../aplicacion/puertos';

/**
 * A2 (15-S2) · la regla de la vía del video que usa la API: la del núcleo de
 * proveedores, la MISMA que el paso 7 del ensayo. Se entrega aquí, en la
 * infraestructura, porque la capa de aplicación sólo conoce su puerto
 * (`ReglaDeVideo`): no importa VALOR del paquete de proveedores (frontera A).
 */
export const REGLA_DE_VIDEO: ReglaDeVideo = {
  codecsDeLaOferta,
  decidir: decidirViaDeVideo,
  frase: fraseDeVideoNoReproducible,
};

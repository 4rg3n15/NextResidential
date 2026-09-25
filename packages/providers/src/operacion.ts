/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ENTRADA DE OPERACIÓN · para guiones que se ejecutan DELANTE de los equipos
 *
 * El barril (`index.ts`) es la API pública para la aplicación, y la 15-C lo
 * dejó mínimo a propósito: la API no debe ver rutas, clientes ni jueces del
 * fabricante (KPI-11). Pero el guion de puesta en marcha en sitio sí necesita
 * exactamente eso —recorrer el catálogo ruta por ruta y decir cuál contesta—,
 * y al perder el barril esas exportaciones se quedó roto sin que nada lo
 * detectara (D-132, ETAPA 15-D).
 *
 * Esta entrada existe para ese único consumidor y se publica como subruta
 * `@ncr/providers/operacion`. El control de extensibilidad sigue vigente: nada
 * bajo `apps/` la importa, y el guion la carga desde `dist/` como siempre.
 */
export {
  RUTAS,
  MARCADOR_DE_CANAL,
  rutaPara,
  rutasDeFamilia,
  exigeCanal,
} from './equipo/catalogo-de-rutas';
export type { RutaDeEquipo, Procedencia } from './equipo/tipos-de-ruta';
export { ClienteDeEquipo, EquipoInalcanzable } from './equipo/cliente';
export { interpretarError } from './equipo/errores-del-fabricante';
export { juzgarModo, leerCtrlMod } from './camara/modo-de-control';
export { CARRIL_VERIFICADO_DE_LA_CAMARA } from './camara/carril';
export { diagnosticarEquipo } from './diagnostico/diagnostico-de-equipo';
export { fichaDe } from './diagnostico/ficha';
export { equiposSimulados } from './simulacion/equipo-simulado';

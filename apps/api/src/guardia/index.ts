/**
 * API pública del módulo de guardia — el barril de §2.2.
 *
 * Sale el módulo y las piezas que la raíz de composición necesita. NO salen los
 * adaptadores simulados: qué se cablea lo decide la composición, y exportarlos
 * invitaría a que otro módulo construyera el suyo.
 */
export { GuardiaModule } from './guardia.module';
export {
  ACCIONADOR_DE_PUERTA,
  BITACORA_DE_ORDENES,
  LONGITUD_MAXIMA_DE_MOTIVO,
  LONGITUD_MINIMA_DE_MOTIVO,
  ROLES_QUE_ACCIONAN,
  motivoValido,
} from './aplicacion/apertura-manual';
export type {
  AccionadorDePuerta,
  BitacoraDeOrdenes,
  OrdenEjecutada,
} from './aplicacion/apertura-manual';
export { CANAL_DE_INTERCOM } from './aplicacion/puertos';
export type { CanalDeIntercom, EstadoDeCanal } from './aplicacion/puertos';
export {
  UMBRAL_DE_DEMORA_SEGUNDOS,
  construirCola,
  resumenDeCola,
} from './aplicacion/cola-de-atencion';

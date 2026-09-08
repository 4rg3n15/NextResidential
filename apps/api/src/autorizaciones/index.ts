/**
 * API pública del módulo de autorizaciones — el barril de §2.2.
 *
 * Ningún otro módulo importa rutas internas de este: solo lo que se publica
 * aquí. Lo que sale es el caso de uso de decisión y sus puertos; lo que NO sale
 * son los controladores, la firma de la ingesta ni los DTOs, que son detalles
 * de su capa de presentación.
 *
 * El módulo de eventos consume `DecidirAcceso` a través de esta entrada, y solo
 * desde su raíz de composición (`eventos.module.ts`): la capa de aplicación de
 * eventos habla con su propio puerto `MotorDeDecision` y no conoce este nombre.
 */
export { DecidirAcceso } from './aplicacion/evaluar-acceso';
export { CARGADOR_DE_CONTEXTO, REPOSITORIO_VERSION_REGLAS } from './aplicacion/puertos';
export type {
  CargadorDeContexto,
  RepositorioVersionDeReglas,
  SolicitudDeAcceso,
} from './aplicacion/puertos';
export {
  CargadorDeContextoConservador,
  UMBRAL_DE_CONFIANZA_POR_DEFECTO,
  VersionDeReglasFija,
} from './infraestructura/cargador-conservador';

/**
 * Barril del módulo de plataforma (§2.2 · ETAPA 15-L, H · ADR-031): modo
 * pruebas, regla de IP de porteros, presencia del superadministrador e
 * intentos fallidos de acceso.
 */
export { PlataformaModule } from './plataforma.module';
export { GuardaDeOrigen, SoloGuardiaRemota } from './presentacion/guarda-de-origen';
export { ModoPruebas } from './aplicacion/modo-pruebas';
export { ControlDeIpDePorteros } from './aplicacion/control-de-ip';
export type { PeticionDePortero, VeredictoDeOrigen } from './aplicacion/control-de-ip';
export {
  IntentosDeAcceso,
  MAXIMO_DE_FALLOS,
  PresenciaDeSuperadministrador,
  VENTANA_DE_BLOQUEO_MS,
} from './aplicacion/presencia-y-intentos';
export { MENSAJE_GUARDIA_REMOTA, redValida } from './aplicacion/politica-de-ip';
export {
  AJUSTES_DE_PLATAFORMA,
  REGISTRO_DE_SEGURIDAD,
  REPOSITORIO_DE_REGLAS_DE_IP,
} from './aplicacion/puertos';
export type { EventoDeSeguridad, ReglasDeIp } from './aplicacion/puertos';
export {
  AjustesDePlataformaEnMemoria,
  RegistroDeSeguridadEnMemoria,
  ReglasDeIpEnMemoria,
} from './infraestructura/plataforma-en-memoria';

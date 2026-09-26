/**
 * Barril del módulo de portería (§2.2, ADR-024). Sale el módulo, la guarda
 * que `app.module.ts` registra como global y los puertos que la suite siembra.
 */
export { PorteriaModule } from './porteria.module';
export { GuardaDeTurnoDePorteria } from './presentacion/turno-de-porteria.guard';
export { ControlDeSesiones } from './aplicacion/control-de-sesiones';
export {
  CODIGO_DE_PATRULLAJE,
  REPOSITORIO_DE_PERFILES,
  REPOSITORIO_DE_SESIONES,
  REPOSITORIO_DE_TURNOS,
} from './aplicacion/puertos';
export type {
  CodigoDePatrullaje,
  PerfilDePortero,
  RepositorioDePerfiles,
  RepositorioDeSesiones,
  RepositorioDeTurnos,
  TurnoRegistrado,
} from './aplicacion/puertos';
export {
  PerfilesEnMemoria,
  SesionesEnMemoria,
  TurnosEnMemoria,
} from './infraestructura/porteria-en-memoria';
export { franjaDe } from './dominio/turno';
export type { SesionDePorteria } from './dominio/sesion-de-porteria';
export type { EstadoDeLaPeticion, IdentidadDeLaPeticion } from './aplicacion/control-de-sesiones';

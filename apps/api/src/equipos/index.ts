/**
 * Barril del módulo de equipos (§2.2): esto es lo único que otro módulo puede
 * importar. Ni el repositorio de PostgreSQL ni la sonda salen de aquí.
 */
export { EquiposModule } from './equipos.module';
export {
  REPOSITORIO_DE_EQUIPOS,
  SONDA_DE_EQUIPO,
  SIN_PROBAR,
  TIPOS_DE_EQUIPO,
} from './aplicacion/puertos';
export type {
  AltaDeEquipo,
  ClaseDeSondeo,
  DatosDeEquipo,
  DatosDeSondeo,
  EstadoDeVerificacion,
  ProtocoloDeEquipo,
  RepositorioDeEquipos,
  ResultadoDeSondeo,
  SondaDeEquipo,
  TipoDeEquipo,
} from './aplicacion/puertos';

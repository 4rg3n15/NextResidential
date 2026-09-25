/**
 * Barril del módulo de equipos (§2.2): esto es lo único que otro módulo puede
 * importar. Ni el repositorio de PostgreSQL ni la sonda salen de aquí.
 */
export { EquiposModule } from './equipos.module';
/**
 * ETAPA 15-D (D5) · el registro que el proveedor de hardware necesita para
 * resolver un identificador de dispositivo a dirección y credencial. Sale por
 * el barril porque lo compone `app.module.ts`, no otro módulo: es la ÚNICA
 * pieza de infraestructura de este módulo que se expone, y sólo su clase.
 */
export { RegistroDeEquiposPg } from './infraestructura/registro-de-equipos-pg';
export {
  REPOSITORIO_DE_EQUIPOS,
  SONDA_DE_EQUIPO,
  SIN_PROBAR,
  TIPOS_DE_EQUIPO,
} from './aplicacion/puertos';
/** A4 (15-E) · los equipos activos que emiten, para que el receptor los escuche. */
export { EQUIPOS_QUE_EMITEN } from './aplicacion/puertos';
export type { EquipoQueEmite } from './aplicacion/puertos';
/** A3 (15-E) · las terminales con biblioteca de rostros, por capacidad. */
export { TERMINALES_DE_ROSTROS } from './aplicacion/terminales-de-rostros';
export type { TerminalDeRostros } from './aplicacion/terminales-de-rostros';
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

/**
 * Barril del módulo de equipos (§2.2): esto es lo único que otro módulo puede
 * importar. Ni el repositorio de PostgreSQL ni la sonda salen de aquí.
 */
export { EquiposModule } from './equipos.module';
/**
 * ETAPA 15-D (D5) · el registro que el proveedor de hardware necesita para resolver un
 * equipo a dirección y credencial (lo compone `app.module.ts`). 15-Q2 · y el secreto
 * del Alarm Server: los componen el túnel del Edge (D2), que los entrega al conjunto.
 */
export { RegistroDeEquiposPg } from './infraestructura/registro-de-equipos-pg';
export { SecretosDeAlarmServerPg } from './infraestructura/secretos-de-alarm-server-pg';
export {
  REPOSITORIO_DE_EQUIPOS,
  SONDA_DE_EQUIPO,
  SIN_PROBAR,
  TIPOS_DE_EQUIPO,
} from './aplicacion/puertos';
/** A4 (15-E) · los equipos activos que emiten, para que el receptor los escuche. */
export { EQUIPOS_ACTIVOS, EQUIPOS_QUE_EMITEN } from './aplicacion/puertos';
/** 15-L · el equipo de la petición es de la copropiedad de la ruta (404 si no). */
export { ALCANCE_DE_EQUIPOS, AlcanceDeEquipos } from './presentacion/alcance-de-equipos';
/** R1 (15-L) · de quién es un equipo que publica: lo pregunta el receptor. */
export { COPROPIEDAD_DE_EQUIPO } from './aplicacion/puertos';
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
/**
 * C6 (15-M) · el secreto con el que cada cámara publica en el Alarm Server: lo
 * emite este módulo en el alta y lo ACREDITA el receptor, por este barril.
 */
export { SECRETOS_DE_ALARM_SERVER } from './aplicacion/secretos-de-alarm-server';
export type { SecretosDeAlarmServer } from './aplicacion/secretos-de-alarm-server';
/**
 * E5 (15-M) · UNA fuente de verdad del estado del equipo: la lista, la ficha
 * y el tablero la comparten. Sale por el barril con su DTO y el lector de la
 * señal de la escucha, para que el tablero no reinvente el criterio.
 */
export { aEstadoSalud, entradasDeEstado, estadoDelEquipo } from './aplicacion/estado-del-equipo';
export type { EntradasDeEstado, EstadoDelEquipo, EnLinea } from './aplicacion/estado-del-equipo';
export { LECTOR_DE_SENALES } from './aplicacion/senal-de-eventos';
export type { LectorDeSenales, SenalDeEventos } from './aplicacion/senal-de-eventos';
export { EstadoDelEquipoDto, aEstadoDelEquipoDto } from './presentacion/dto-estado-del-equipo';
// C4 (15-M) · el puerto que la baja consume; lo satisface biometría.
export { RETIRO_DE_PLANTILLAS_DE_EQUIPO } from './aplicacion/retiro-de-plantillas';
export { ARCHIVO_DE_ALERTAS_DEL_EQUIPO } from './aplicacion/archivo-de-alertas-del-equipo';
export {
  REENVIO_DE_PLANTILLAS_A_EQUIPO,
  recibePlantillas,
} from './aplicacion/reenvio-de-plantillas';
export type { ReenvioDePlantillasAEquipo } from './aplicacion/reenvio-de-plantillas';
export type { ArchivoDeAlertasDelEquipo } from './aplicacion/archivo-de-alertas-del-equipo';
export type {
  ResultadoDeRetiroDePlantillas,
  RetiroDePlantillasDeEquipo,
} from './aplicacion/retiro-de-plantillas';
/**
 * 15-P · P3 · los puntos de acceso del equipo (`puntos_de_acceso`), para que la
 * guardia resuelva la puerta del punto elegido sin consultar la tabla.
 */
export { PuntosDeOperacion } from './aplicacion/puntos-de-operacion';
export type { PuntoDeAcceso } from './aplicacion/puntos-de-acceso';

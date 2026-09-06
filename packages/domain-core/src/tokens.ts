/**
 * Tokens de inyección (§2.3, DIP).
 *
 * Son `symbol` y no strings ni clases: un symbol no colisiona y, sobre todo,
 * NO es un import de NestJS. El dominio declara la etiqueta con la que se pide
 * su puerto; el contenedor de la infraestructura decide qué inyectar. Así el
 * dominio sigue sin conocer el framework (§2.2).
 */
export const RELOJ = Symbol.for('ncr.puerto.Reloj');
export const GENERADOR_DE_ID = Symbol.for('ncr.puerto.GeneradorDeId');
export const BITACORA = Symbol.for('ncr.puerto.Bitacora');
export const UNIDAD_DE_TRABAJO = Symbol.for('ncr.puerto.UnidadDeTrabajo');
export const BUS_DE_EVENTOS = Symbol.for('ncr.puerto.BusDeEventos');
export const NOTIFICADOR = Symbol.for('ncr.puerto.Notificador');
export const ALMACEN_EVIDENCIA = Symbol.for('ncr.puerto.AlmacenEvidencia');
export const REGISTRO_IDEMPOTENCIA = Symbol.for('ncr.puerto.RegistroDeIdempotencia');

export const VIVIENDA_REPO = Symbol.for('ncr.puerto.ViviendaRepo');
export const AUTORIZACION_REPO = Symbol.for('ncr.puerto.AutorizacionRepo');
export const ZONA_REPO = Symbol.for('ncr.puerto.ZonaRepo');
export const EVENTO_REPO = Symbol.for('ncr.puerto.EventoRepo');
export const REGLA_REPO = Symbol.for('ncr.puerto.ReglaRepo');
export const LISTA_NEGRA_REPO = Symbol.for('ncr.puerto.ListaNegraRepo');
export const DISPOSITIVO_REPO = Symbol.for('ncr.puerto.DispositivoRepo');
export const CONSENTIMIENTO_REPO = Symbol.for('ncr.puerto.ConsentimientoRepo');
export const PLANTILLA_REPO = Symbol.for('ncr.puerto.PlantillaRepo');

export const ACCESS_POINT_PROVIDER = Symbol.for('ncr.puerto.AccessPointProvider');
export const PLATE_EVENT_SOURCE = Symbol.for('ncr.puerto.PlateEventSource');
export const FACE_TEMPLATE_PROVIDER = Symbol.for('ncr.puerto.FaceTemplateProvider');
export const INTERCOM_PROVIDER = Symbol.for('ncr.puerto.IntercomProvider');

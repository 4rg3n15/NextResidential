/**
 * Adaptadores de los puertos de proveedor · LA API PÚBLICA DEL PAQUETE.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ESTE BARRIL SE ENCOGIÓ EN LA 15-C, Y ES LA MITAD QUE LE FALTABA A ADR-03
 *
 * Hasta ahora exportaba **todo**: `TerminalFacial`, `ControlDeBarreraVehicular`,
 * `Videoportero`, `IntercomDeEquipo`, el cliente, el catálogo de rutas. El
 * resto del sistema podía nombrar cada pieza de cada familia, y mientras pueda
 * nombrarlas «el hardware es intercambiable» es una aspiración, no un hecho:
 * basta que alguien importe `TerminalFacial` en un módulo de la API para que
 * cambiar de fabricante deje de ser cambiar una línea.
 *
 * Lo que sale de aquí, y nada más:
 *
 * | Qué                        | Para qué                                     |
 * | -------------------------- | -------------------------------------------- |
 * | `MockProvider`             | El adaptador simulado (ADR-03)               |
 * | `HikvisionProvider`        | El adaptador real                            |
 * | La **fábrica**             | El único sitio que decide cuál se inyecta    |
 * | El **registro de equipos** | El puerto que la API implementa con su base  |
 * | La **fuente de placas**    | El puerto de eventos, y por dónde se publica |
 * | La **recepción**           | Entrada única del transporte de escucha      |
 * | El **diagnóstico**         | Lo que la consola enseña de un equipo        |
 * | Los **contratos de evento**| El tipo normalizado que cruza la frontera    |
 *
 * Todo lo demás —clientes, rutas, cuerpos, erratas del fabricante— es interno.
 * KPI-11 ya impedía que el vocabulario saliera en forma de cadena; esto impide
 * además que salga en forma de **tipo**, que era la vía que quedaba abierta.
 */

// ── El NÚCLEO neutral · ETAPA 15-D (O2) ──────────────────────────────────────
/**
 * Lo que cualquier adaptador —de esta marca, de otra, o inventado— cumple, y
 * lo que el resto del sistema mira para decidir: capacidades y errores. No hay
 * aquí un solo nombre de fabricante. El adaptador ficticio de `src/ficticio/`
 * NO sale por este barril: `scripts/lib/frontera-extensibilidad.mjs` lo impide.
 */
export * from './nucleo/capacidades';
export * from './nucleo/errores';
export type { ProveedorDeEquipos } from './nucleo/proveedor';
export type { VeredictoRemoto } from './nucleo/verificacion-remota';

// ── Los dos adaptadores y su punto de composición ────────────────────────────
export * from './mock/mock-provider';
export * from './mock/intercom-simulado';
export * from './mock/simulacion';
export * from './hikvision/hikvision-provider';
export * from './hikvision/registro-de-equipos';
export * from './fabrica';
export {
  capacidadesDesdeDeviceCap,
  canalesDeAudioDesde,
  descubrirCapacidadesDe,
} from './hikvision/capacidades-hikvision';

/**
 * El control de barrera se compone **dentro** de este paquete y se expone como
 * función, no como clase: la API pregunta «¿hay un control configurado?» y
 * recibe el puerto del dominio. Nunca nombra el adaptador.
 */
export {
  crearControlDeBarreraDesdeEntorno,
  ConfiguracionDeBarreraIncompleta,
} from './barrera/desde-entorno';

// ── Los puertos de evento y su transporte ────────────────────────────────────
export * from './equipo/fuente-de-placas';
export * from './hikvision/recepcion';
export type {
  EventoDeEquipo,
  ClaseDeEvento,
  QuienAbrio,
  RecuadroDetectado,
  BloqueDeAlertStream,
} from './hikvision/contratos-de-evento';
export { EscuchaDeAlertStream, transporteSegunCapacidades } from './equipo/escucha-alertstream';
export type { TransporteDeFlujo, OpcionesDeEscucha } from './equipo/escucha-alertstream';
/** A4 (15-E) · lo que el proveedor devuelve al pedirle que escuche un equipo. */
export type { EscuchaActiva, TransporteDeEscucha } from './nucleo/escucha';
/** A5 (15-E) · el origen RTSP que el proveedor entrega al puente de video. */
export type { OrigenDeVideo } from './nucleo/video';
export { CAMPOS_IGNORADOS_A_PROPOSITO } from './hikvision/contratos-de-evento';

// ── Diagnóstico y corrección de un equipo, para la consola ───────────────────
export * from './diagnostico/diagnostico-de-equipo';
export * from './diagnostico/correcciones';
export * from './diagnostico/ficha';
export type { VeredictoDeControl, HallazgoDeConfiguracion } from './camara/veredicto-de-control';
export type { VeredictoDeDisparador } from './camara/disparadores-vinculados';
export type { VeredictoDePais, ClaseDePais } from './camara/pais-del-algoritmo';
export type { VeredictoDelReceptor, ImagenesDelEvento } from './camara/receptor-en-el-equipo';
export { IMAGENES, IMAGENES_SIN_ROSTRO } from './camara/receptor-en-el-equipo';
export type { VeredictoDeCapacidadAnpr } from './camara/capacidades-anpr';
export { EquipoDecidePorSuCuenta } from './camara/modo-de-control';
export type { VeredictoDeModo } from './camara/modo-de-control';
export { EquipoInalcanzable } from './equipo/cliente';
export type { ReaccionAlError, ErrorDelFabricante } from './equipo/errores-del-fabricante';
export { LISTAS_DEL_EQUIPO_NO_SE_USAN } from './equipo/errores-del-fabricante';

// ── El simulado de equipo, que es infraestructura de PRUEBA ──────────────────
/**
 * Se exporta porque la suite de contrato de la API lo necesita para correr sin
 * hardware, que es justo lo que ADR-03 exige poder hacer. No es una pieza de
 * familia: es un `fetch` que se comporta como un aparato.
 */
export * from './simulacion/equipo-simulado';
export * from './simulacion/camara-que-publica';

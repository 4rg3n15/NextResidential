/**
 * API pública del módulo de eventos — el barril de §2.2.
 *
 * Sale lo que la ingesta necesita para registrar un acceso y lo que la consola
 * necesita para leerlo. NO sale el repositorio de PostgreSQL ni el canal en
 * proceso: qué adaptador se cablea es decisión de la raíz de composición.
 */
export { EventosModule } from './eventos.module';
export { RegistrarAcceso } from './aplicacion/registrar-acceso';
/** E5 (15-M) · alertas por EQUIPO, deduplicadas: las abre el ingestor por este puerto. */
export { ALERTAS_DE_EQUIPO } from './aplicacion/deduplicacion-de-alertas';
export {
  AlertasDelCicloDelEquipo,
  NOTA_DE_RESOLUCION_AUTOMATICA,
} from './aplicacion/alertas-del-ciclo-del-equipo';
export type { AlertasDeEquipo, AlertaDeEquipoNueva } from './aplicacion/deduplicacion-de-alertas';
export {
  CANAL_TIEMPO_REAL,
  TEMA_LLAMADAS,
  ESCALAMIENTO_DE_ALERTA,
  REPOSITORIO_ALERTAS,
  REPOSITORIO_DISPOSITIVOS,
  REPOSITORIO_EVENTOS,
} from './aplicacion/puertos';
export type {
  CanalTiempoReal,
  EventoRegistrado,
  RepositorioAlertas,
  RepositorioDispositivos,
  RepositorioEventos,
} from './aplicacion/puertos';
export { REGISTRO_DE_EVIDENCIA, registroSinBase } from './aplicacion/registro-de-evidencia';
/** G1 (15-N) · qué necesita a una persona (P-22): lo usan la cola, las alertas y la ingesta. */
export {
  DISPARADORES_CRITICOS,
  DISPARADORES_DE_ATENCION,
  TIPOS_DE_EQUIPO_QUE_DISPARAN,
  TIPOS_QUE_TERMINAN_LA_LLAMADA,
  disparadorDeAcceso,
  disparadorDeEventoDeEquipo,
} from './aplicacion/disparadores-de-atencion';
export type { DisparadorDeAtencion } from './aplicacion/disparadores-de-atencion';
/** 15-L (Bloque B) · lo que un equipo emite y no es un acceso, y lo que la plataforma le hace. */
export {
  REGISTRO_DE_EVENTOS_DE_EQUIPO,
  REPOSITORIO_EVENTOS_DE_EQUIPO,
  RegistroDeEventosDeEquipo,
  TEMA_EVENTOS_DE_EQUIPO,
} from './aplicacion/eventos-de-equipo';
export type {
  EventoDeEquipoNuevo,
  EventoDeEquipoGuardado,
  RepositorioEventosDeEquipo,
} from './aplicacion/eventos-de-equipo';
export type { RegistroDeEvidencia, TipoDeEvidencia } from './aplicacion/registro-de-evidencia';
export {
  LIMITADOR_DISPOSITIVO,
  limitadorPorDispositivo,
} from './presentacion/limite-por-dispositivo';
// `LatidoDto` cruza la frontera porque la ingesta (en `autorizaciones`) recibe el
// latido por la misma puerta que los eventos: olor conocido y anotado (ETAPA 06).
export { LatidoDto } from './presentacion/dtos';
// 15-Q · la bandeja del Edge: UNA regla para la ruta de la ingesta y la del Edge.
export { ReconciliarDecisiones } from './aplicacion/reconciliar-decisiones';
export type {
  DecisionReconciliable,
  DecisionReconciliada,
} from './aplicacion/reconciliar-decisiones';
// ETAPA 14 · la vigilancia de latidos: la invoca el planificador (D-31).
export { VigilarLatidos } from './aplicacion/vigilancia-latidos';
export type { ParteDeVigilancia } from './aplicacion/vigilancia-latidos';

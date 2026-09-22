/** Barril del módulo de planificación (§2.2). */
export {
  PlanificacionModule,
  CicloDelPlanificador,
  ACTOR_DEL_PLANIFICADOR,
  trabajosDeMantenimiento,
} from './planificacion.module';
export type { CasosDeUsoDeMantenimiento } from './planificacion.module';
export { PLANIFICADOR, CATALOGO_DE_COPROPIEDADES } from './aplicacion/puertos';
export type {
  CatalogoDeCopropiedades,
  Planificador,
  TrabajoProgramado,
} from './aplicacion/puertos';
export { HORARIOS, trabajoPorCopropiedad } from './aplicacion/trabajos';
export type { OperacionPorCopropiedad } from './aplicacion/trabajos';
export { PlanificadorPgBoss } from './infraestructura/planificador-pgboss';
export { PlanificadorInerte } from './infraestructura/planificador-inerte';
export {
  CatalogoDeCopropiedadesPg,
  CatalogoDeCopropiedadesEnMemoria,
} from './infraestructura/catalogo-copropiedades-pg';

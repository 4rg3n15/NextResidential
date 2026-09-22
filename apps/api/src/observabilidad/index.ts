/**
 * Barril del módulo de observabilidad (§2.2): a un módulo se entra por aquí.
 */
export { ObservabilidadModule } from './observabilidad.module';
export type { OpcionesObservabilidad } from './observabilidad.module';
export { METRICAS, REPORTE_DE_ERRORES } from './aplicacion/puertos';
export type {
  FilaDeLatencia,
  Metricas,
  ReporteDeErrores,
  ResumenDeLatencias,
} from './aplicacion/puertos';
export { CLAVES_KPI, KPIS, esClaveKpi } from './aplicacion/kpis';
export type { ClaveKpi, DefinicionKpi } from './aplicacion/kpis';
export { percentil, resumirMuestras } from './aplicacion/percentiles';
export type { ResumenDeMuestras } from './aplicacion/percentiles';
export { RegistroDeLatencias } from './infraestructura/registro-de-latencias';
export { ReporteSentry, analizarDsn } from './infraestructura/sentry-http';
export type { Dsn, OpcionesSentry } from './infraestructura/sentry-http';
export { SinReporteDeErrores } from './infraestructura/sin-reporte';
export { MideKpi, CLAVE_KPI } from './presentacion/mide-kpi.decorator';
export { InterceptorDeLatencias } from './presentacion/interceptor-de-latencias';
export { LatenciasDto, FilaDeLatenciaDto, DefinicionKpiDto } from './presentacion/respuestas';

/**
 * API pública del módulo (§2.2): sólo lo que otros módulos y `main.ts`
 * necesitan. El controlador y el guard NO salen: se montan por Nest.
 */
export { AlarmServerModule } from './alarmserver.module';
/**
 * El middleware NO sale por aquí: vive en `comun/sobre-de-equipo.ts`. Montarlo
 * desde el barril arrastraría el grafo de módulos al principio de la carga.
 */
/**
 * El registro de equipos NO sale por aquí: vive en `comun/` porque el esquema
 * de configuración también lo necesita, y quien lo quiera lo toma de allí.
 */

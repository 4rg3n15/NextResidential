/**
 * Adaptadores de los puertos de proveedor.
 *
 * `MockProvider` (ETAPA 05) y `HikvisionProvider` (ETAPA 15) viven aquí y solo
 * aquí, detrás de las MISMAS interfaces declaradas en `@ncr/domain-core`
 * (ADR-03). Este es además el único paquete donde el análisis estático de
 * KPI-11 admite la palabra ISAPI o una IP de dispositivo: fuera de aquí, el
 * build se rompe.
 */
export * from './barrera/digest';
export * from './barrera/control-barrera';
export * from './barrera/desde-entorno';
export * from './mock/simulacion';
export * from './mock/mock-provider';
export * from './mock/intercom-simulado';

/**
 * Los dos contratos de evento de Hikvision. Se exportan desde la ETAPA 11-A —antes
 * de que exista el adaptador— porque la normalización se prueba desde hoy: el día
 * que llegue el equipo, lo que se estrena es el transporte y no el analizador.
 */
export * from './hikvision/contratos-de-evento';

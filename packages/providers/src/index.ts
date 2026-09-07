/**
 * Adaptadores de los puertos de proveedor.
 *
 * `MockProvider` (ETAPA 05) y `HikvisionProvider` (ETAPA 15) viven aquí y solo
 * aquí, detrás de las MISMAS interfaces declaradas en `@ncr/domain-core`
 * (ADR-03). Este es además el único paquete donde el análisis estático de
 * KPI-11 admite la palabra ISAPI o una IP de dispositivo: fuera de aquí, el
 * build se rompe.
 */
export * from './mock/simulacion';
export * from './mock/mock-provider';

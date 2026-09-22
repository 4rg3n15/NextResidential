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
export * from './hikvision/publicacion-alarm-server';
/**
 * ETAPA 15 · el transporte compartido por los tres equipos, el catálogo de
 * rutas con su procedencia, y los adaptadores de cada familia.
 */
export * from './equipo/cliente';
export * from './equipo/catalogo-de-rutas';
export * from './equipo/escucha-alertstream';
export * from './terminal/terminal-facial';
export * from './videoportero/videoportero';
export * from './videoportero/intercom-equipo';
export * from './simulacion/equipo-simulado';
export * from './simulacion/camara-que-publica';

/**
 * API pública del módulo `edge` (15-Q) — el barril de §2.2. Salen los módulos (el del túnel
 * desde la 15-Q2) y los puertos que las pruebas sustituyen; NO la derivación de la
 * credencial ni el modelo de lectura de la instantánea, que son detalles de este módulo.
 */
export { EdgeModule } from './edge.module';
export { TunelDelEdgeModule } from './tunel-del-edge.module';
export { REPOSITORIO_DE_PUENTES } from './aplicacion/puentes';
export { REPOSITORIO_DE_GATEWAYS } from './aplicacion/puertos';
export type { GatewayRegistrado, RepositorioDeGateways } from './aplicacion/puertos';

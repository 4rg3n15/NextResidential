/**
 * API pública del módulo `edge` (15-Q) — el barril de §2.2.
 *
 * Sale el módulo y el puerto del registro de gateways (las pruebas lo
 * sustituyen); NO salen la derivación de la credencial ni el modelo de lectura
 * de la instantánea, que son detalles de este módulo.
 */
export { EdgeModule } from './edge.module';
export { REPOSITORIO_DE_GATEWAYS } from './aplicacion/puertos';
export type { GatewayRegistrado, RepositorioDeGateways } from './aplicacion/puertos';

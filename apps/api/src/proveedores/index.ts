/**
 * API pública del módulo (§2.2). Los tokens de los cuatro puertos viven en
 * `@ncr/domain-core`, que es donde se declaran, y quien los necesite los toma
 * de allí. Lo que sale de aquí es lo que el dominio NO declara y la composición
 * sí necesita: la instancia única del proveedor —para quien consume los cuatro
 * puertos como uno, con capacidades y bloqueo— y la fuente de placas compartida
 * por el adaptador y el receptor (ETAPA 15-E, A1).
 */
export { ProveedoresModule, PROVEEDOR_DE_EQUIPOS, FUENTE_DE_PLACAS } from './proveedores.module';

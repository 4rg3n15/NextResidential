/**
 * API pública del módulo (§2.2): sólo el módulo. Los tokens de los cuatro
 * puertos viven en `@ncr/domain-core`, que es donde se declaran, y quien los
 * necesite los toma de allí — no de aquí.
 */
export { ProveedoresModule } from './proveedores.module';

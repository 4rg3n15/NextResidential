/** API pública del módulo (§2.2): la instancia única del proveedor, la fuente de placas
 * compartida (15-E) y, desde la 15-Q2, los túneles de los Edge puente (ADR-035). */
export { ProveedoresModule, PROVEEDOR_DE_EQUIPOS, FUENTE_DE_PLACAS } from './proveedores.module';
export { TUNELES_DE_EDGE, TunelesDeEdge } from './tuneles-de-edge';
export type { EstadoDelTunel, TunelVivo } from './tuneles-de-edge';
export { RUTAS_DE_EQUIPOS } from './rutas-de-equipos';
export type { RutasDeEquipos } from './rutas-de-equipos';
export { enHechoDelEdge } from './hecho-en-curso';
export { copropiedadEnCurso, InterceptorDeCopropiedadEnCurso } from './copropiedad-en-curso';

/**
 * API pública del módulo de tablero — el barril de §2.2.
 *
 * Sale el módulo y el puerto de lectura. No sale ningún adaptador: qué se
 * cablea es decisión de la raíz de composición.
 */
export { TableroModule } from './tablero.module';
export { REPOSITORIO_TABLERO } from './aplicacion/puertos';
export type { RepositorioTablero } from './aplicacion/puertos';
// 15-Z3 · el puerto de la actividad por vivienda, para que la suite declare filas.
export { ACTIVIDAD_POR_VIVIENDA } from './aplicacion/actividad-por-vivienda';
export type {
  ActividadPorVivienda,
  ActividadDeVivienda,
} from './aplicacion/actividad-por-vivienda';

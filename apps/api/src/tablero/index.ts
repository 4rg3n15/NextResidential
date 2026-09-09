/**
 * API pública del módulo de tablero — el barril de §2.2.
 *
 * Sale el módulo y el puerto de lectura. No sale ningún adaptador: qué se
 * cablea es decisión de la raíz de composición.
 */
export { TableroModule } from './tablero.module';
export { REPOSITORIO_TABLERO } from './aplicacion/puertos';
export type { RepositorioTablero } from './aplicacion/puertos';

/**
 * API pública del módulo de zonas — el barril de §2.2.
 *
 * Sale la raíz de composición —que es quien satisface `ResolutorDeZona`, el
 * puerto que declara el módulo de autorizaciones— y los puertos propios, para
 * que otra composición pueda sustituir el repositorio. No sale el adaptador de
 * PostgreSQL ni el doble en memoria: quién persiste es decisión de la raíz.
 */
export { ZonasModule } from './zonas.module';
export { REPOSITORIO_AUTORIZACIONES_ZONA, REPOSITORIO_ZONAS } from './aplicacion/puertos';
export type {
  RepositorioAutorizacionesZona,
  RepositorioZonas,
  ResultadoOcupacion,
} from './aplicacion/puertos';
export { LiberarAforo, ValidarAforo } from './aplicacion/casos-de-uso';

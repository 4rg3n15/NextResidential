/**
 * API pública del módulo de eventos — el barril de §2.2.
 *
 * Sale lo que la ingesta necesita para registrar un acceso y lo que la consola
 * necesita para leerlo. NO sale el repositorio de PostgreSQL ni el canal en
 * proceso: qué adaptador se cablea es decisión de la raíz de composición.
 */
export { EventosModule } from './eventos.module';
export { RegistrarAcceso } from './aplicacion/registrar-acceso';
export {
  CANAL_TIEMPO_REAL,
  REPOSITORIO_ALERTAS,
  REPOSITORIO_DISPOSITIVOS,
  REPOSITORIO_EVENTOS,
} from './aplicacion/puertos';
export type {
  CanalTiempoReal,
  RepositorioAlertas,
  RepositorioDispositivos,
  RepositorioEventos,
} from './aplicacion/puertos';
export {
  LIMITADOR_DISPOSITIVO,
  limitadorPorDispositivo,
} from './presentacion/limite-por-dispositivo';
/**
 * `LatidoDto` sale del barril porque el controlador de ingesta —que vive en
 * `autorizaciones`— recibe el latido del dispositivo por la misma puerta que
 * los eventos. Que un DTO cruce la frontera es un olor conocido y queda
 * anotado: lo natural sería que la ingesta entera viviera en `eventos`, y eso
 * se reevalúa cuando la ETAPA 15 traiga el Alarm Server real.
 */
export { LatidoDto } from './presentacion/dtos';

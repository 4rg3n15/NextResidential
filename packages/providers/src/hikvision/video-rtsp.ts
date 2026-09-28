import type { OrigenDeVideo } from '../nucleo/video';
import type { EquipoRegistrado } from './registro-de-equipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL FLUJO RTSP DE ESTE FABRICANTE · A5 · DOCUMENTADO, NO VERIFICADO
 *
 * `rtsp://<usuario>:<clave>@<host>:554/Streaming/Channels/<canal><flujo>`:
 *   · canal 1 = primera cámara del equipo;
 *   · flujo 01 = principal, 02 = secundario (menor resolución y latencia).
 *
 * Es el [SUPUESTO] S-46: la forma sale de la documentación del fabricante y
 * de la práctica común con sus cámaras y terminales; el videoportero del
 * proyecto expone su cámara por el mismo camino según su manual. Lo que se
 * confirma en sitio es que cada uno de los tres equipos contesta a esta URL
 * y con qué códec (el puente sólo remuestrea audio, no transcodifica video:
 * si el equipo emite H.265 y el navegador no lo reproduce, el ajuste es en
 * el equipo —H.264— y la guía lo dice).
 *
 * Se usa el flujo SECUNDARIO para la consola: la guardia necesita ver quién
 * está en la puerta con la menor latencia posible (KPI-33), no la máxima
 * resolución. El principal queda para grabación, que no está en alcance.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const PUERTO_RTSP = 554;
/** D2 (15-L) · el subflujo del canal 1: lo que el navegador reproduce con menos retardo. */
export const CANAL_DE_VIDEO_POR_OMISION = '102';

const CON_VIDEO: ReadonlySet<EquipoRegistrado['tipo']> = new Set([
  'camara_lpr',
  'terminal_facial',
  'intercom',
]);

/** Codifica usuario y clave para que un `@` o un `:` no rompan la URL. */
const credencial = (usuario: string, clave: string): string =>
  `${encodeURIComponent(usuario)}:${encodeURIComponent(clave)}`;

/** El canal declarado, o 102. Termina en 01 → flujo principal; si no, secundario. */
export const canalDeVideoDe = (equipo: Pick<EquipoRegistrado, 'canalDeVideo'>): string =>
  equipo.canalDeVideo ?? CANAL_DE_VIDEO_POR_OMISION;

/** La ruta RTSP del flujo, sin credencial: la usa también la sonda de códec. */
export const caminoRtspDe = (canal: string): string => `/Streaming/Channels/${canal}`;

/**
 * C2/D2 (15-L) · el canal sale de la ficha del equipo y el puerto del `.env`
 * (`VIDEO_PUERTO_RTSP`): nada de esto obliga a tocar código en sitio.
 */
export const origenRtspDe = (
  equipo: EquipoRegistrado,
  puerto: number = PUERTO_RTSP,
): OrigenDeVideo | null => {
  if (!CON_VIDEO.has(equipo.tipo)) return null;
  const canal = canalDeVideoDe(equipo);
  const flujo = canal.endsWith('01') ? 'principal' : 'secundario';
  return {
    rtsp: `rtsp://${credencial(equipo.usuario, equipo.clave)}@${equipo.host}:${String(puerto)}${caminoRtspDe(canal)}`,
    flujo,
    detalle: `flujo ${canal} (${flujo}) por RTSP (S-46); el puente lo sirve por WebRTC`,
  };
};

import { bloques, etiqueta } from '../equipo/xml';
import { canalPropuesto } from '../nucleo/canal-de-video';
import type { ConsultaDeCapacidad } from './rostros-y-personas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E2/C1 (15-M) · LOS CANALES DE VIDEO QUE EL EQUIPO DECLARA
 *
 * Visto en sitio el 28/09: la cámara «no tiene el canal 102» (RTSP 412) y nadie
 * sabía cuál sí tenía sin abrir su panel. `GET /ISAPI/Streaming/channels`
 * devuelve `StreamingChannelList` con un `StreamingChannel` por flujo: su `id`
 * (canal×100+flujo: 101 principal, 102 subflujo…), si está `enabled` y el
 * `Video/videoCodecType`. Con eso la ficha de la consola ofrece la lista en vez
 * de un número a ciegas, y el subflujo (`x02`) por omisión si existe.
 *
 * El parseo es puro; el descubrimiento usa la misma `ConsultaDeCapacidad` que
 * rostros y personas (`rostros-y-personas.ts`): no lanza, y lo que no se pudo
 * leer vuelve como lista vacía con su motivo en palabras.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface CanalDeVideoDeclarado {
  /** `101`, `102`, `201`… tal como lo nombra el equipo. */
  readonly id: string;
  /** «H.264», «H.265», «MJPEG»… normalizado como el SDP; `null` si no lo dice. */
  readonly codec: string | null;
}

export const PREGUNTA_DE_CANALES_DE_VIDEO = 'leer los canales de video del equipo';

/** `H.264`, `H264`, `h.264+`… → «H.264»; lo demás, en mayúsculas y sin `+`. */
export const codecNormalizado = (crudo: string | null): string | null => {
  if (crudo === null || crudo.trim() === '') return null;
  const c = crudo.trim().toUpperCase().replace(/\+$/, '');
  if (/^H\.?264$/.test(c)) return 'H.264';
  if (/^H\.?265$/.test(c) || c === 'HEVC') return 'H.265';
  if (c === 'MJPEG' || c === 'JPEG') return 'MJPEG';
  return c;
};

/** Los canales HABILITADOS del `StreamingChannelList`, en el orden del equipo. */
export const canalesDeVideoDesde = (xml: string): readonly CanalDeVideoDeclarado[] =>
  bloques(xml, 'StreamingChannel')
    .filter((b) => (etiqueta(b, 'enabled') ?? 'true').trim().toLowerCase() !== 'false')
    .flatMap((b) => {
      const id = etiqueta(b, 'id')?.trim() ?? '';
      if (!/^[1-9][0-9]{2,3}$/.test(id)) return [];
      const video = bloques(b, 'Video')[0] ?? '';
      return [{ id, codec: codecNormalizado(etiqueta(video, 'videoCodecType')) }];
    });

/**
 * El subflujo (`x02`) si existe, si no el primero; `null` sin canales. V2
 * (15-N) · la regla vive en `nucleo/canal-de-video.ts`, que es la que decide
 * el canal del video en vivo; aquí sólo se reexpone con su nombre de 15-M.
 */
export const canalDeVideoPorOmision = (
  canales: readonly Pick<CanalDeVideoDeclarado, 'id'>[],
): string | null => canalPropuesto(canales.map((c) => ({ id: c.id, codec: null })));

export interface CanalesDescubiertos {
  readonly canales: readonly CanalDeVideoDeclarado[];
  /** Sólo con la lista vacía: por qué no se leyó, o que el equipo no la admite. */
  readonly motivo: string | null;
}

export const descubrirCanalesDeVideo = async (
  consultar: ConsultaDeCapacidad,
  /**
   * C.3 (15-S1) · la lista NO se pudo leer —o llegó sin ningún canal—, nunca
   * «el equipo no la admite» (NO APLICA): el diagnóstico lo lleva a la ficha,
   * que dice que el canal guardado va sin contrastar. Antes, sólo a la bitácora.
   */
  alNoLeer?: (motivo: string) => void,
): Promise<CanalesDescubiertos> => {
  const r = await consultar(PREGUNTA_DE_CANALES_DE_VIDEO);
  if (r.cuerpo === null) {
    if (!r.noAdmite) alNoLeer?.(r.motivo ?? 'no se pudo leer');
    return {
      canales: [],
      motivo: r.noAdmite ? 'el equipo no lista sus canales de video' : r.motivo,
    };
  }
  const canales = canalesDeVideoDesde(r.cuerpo);
  const motivo = canales.length === 0 ? 'el equipo contestó sin ningún canal habilitado' : null;
  if (motivo !== null) alNoLeer?.(motivo);
  return { canales, motivo };
};

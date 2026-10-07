import type { CanalDeclaradoDeVideo } from '../nucleo/canal-de-video';
import type { VideoDelEquipo } from './diagnostico-de-equipo';
import type { HallazgoDelEquipo } from './ficha';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C.3 (15-S1) · EL CANAL DE VIDEO DE LA FICHA, CONTRASTADO CON EL EQUIPO
 *
 * 06/10: la ficha de la cámara LPR guardaba el 102 y el equipo declara sólo el
 * 101. Hasta aquí eso se decía de pasada, pegado al hallazgo del códec, y con
 * H.264 ese hallazgo es «conforme»: el aviso quedaba dentro de un verde. Ahora
 * es un hallazgo propio, con las tres cosas que el operador necesita: qué
 * canal tiene la ficha, que el equipo NO lo declara (y cuáles sí) y cuál se
 * usará.
 *
 * Y la mitad que faltaba: si la lista NO se pudo leer, el canal de la ficha va
 * sin contrastar, y eso es un `no_comprobado` con su motivo. En sitio el `curl`
 * que leyó el 101 se hizo con admin; la API usa el usuario de servicio
 * [Probable]: si a ése le falta el permiso, la lista no llega y la ficha callaba.
 *
 * El equipo que dice «no listo mis canales» es NO APLICA: sin hallazgo propio;
 * el del video ya dice si el canal de la ficha respondió.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const CAMPO_DEL_CANAL_DE_VIDEO = 'canal de video de la ficha';

const listaDe = (declarados: readonly CanalDeclaradoDeVideo[]): string =>
  declarados.map((c) => (c.codec === null ? c.id : `${c.id} · ${c.codec}`)).join(', ');

export const hallazgoDelCanalDeVideo = (
  v: VideoDelEquipo,
  declarados: readonly CanalDeclaradoDeVideo[] | undefined,
): HallazgoDelEquipo | null => {
  const sustituido = v.sustituido ?? null;
  if (v.origenDelCanal === 'propuesto' && sustituido !== null) {
    return {
      campo: CAMPO_DEL_CANAL_DE_VIDEO,
      estado: 'aviso',
      valorLeido: sustituido,
      valorCorrecto: v.canal,
      detalle:
        `La ficha tiene el canal ${sustituido}, que el equipo NO declara` +
        (declarados === undefined || declarados.length === 0
          ? ''
          : ` (declara: ${listaDe(declarados)})`) +
        `. Se usará el ${v.canal}, el que el equipo declara, y es el que se guarda en la ficha`,
      correccion: null,
    };
  }
  const sinLista = v.listaSinLeer;
  if (
    sinLista !== undefined &&
    (v.origenDelCanal === 'ficha' || v.origenDelCanal === 'por_omision')
  ) {
    const deLaFicha = v.origenDelCanal === 'ficha';
    return {
      campo: CAMPO_DEL_CANAL_DE_VIDEO,
      estado: 'no_comprobado',
      valorLeido: deLaFicha ? v.canal : null,
      valorCorrecto: null,
      detalle:
        `No se pudo contrastar con los canales que declara el equipo (${sinLista}): se usará ` +
        `el ${v.canal} ${deLaFicha ? 'de la ficha' : 'por omisión'} sin contrastarlo. Pruebe ` +
        'la lista con el usuario de servicio, no con un administrador: si con éste se lee y con ' +
        'el de servicio no, a ese usuario le falta permiso',
      correccion: null,
    };
  }
  return null;
};

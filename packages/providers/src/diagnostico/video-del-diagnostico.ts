import { describirRtsp } from '../equipo/rtsp-describe';
import { caminoRtspDe } from '../hikvision/video-rtsp';
import { elegirCanalDeVideo, fraseDeEleccion } from '../nucleo/canal-de-video';
import type { CapacidadesDeEquipo } from '../nucleo/capacidades';
import type { OpcionesDeDiagnostico, VideoDelEquipo } from './diagnostico-de-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * V2 (15-N) · EL VIDEO DEL DIAGNÓSTICO, EN EL CANAL QUE EL EQUIPO DECLARA
 *
 * «Probar conexión» y el alta preguntaban por RTSP el canal de la ficha o, sin
 * él, el 102. La cámara del conjunto no tiene el 102 (RTSP 412 el 29/09). Aquí
 * se elige primero entre los canales que el equipo acaba de declarar
 * (`nucleo/canal-de-video.ts`), se pregunta por ese, y el resultado dice si el
 * canal salió de la ficha o se PROPONE —la API lo guarda—.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const sondearVideoDelEquipo = async (
  opciones: Pick<OpcionesDeDiagnostico, 'host' | 'usuario' | 'clave'>,
  video: { readonly puerto: number; readonly canal: string | null },
  capacidades: CapacidadesDeEquipo | null,
): Promise<VideoDelEquipo> => {
  const eleccion = elegirCanalDeVideo(video.canal, capacidades?.video?.canales);
  if (eleccion.canal === null) {
    return {
      clase: 'rechazo',
      causa: 'sin_canal',
      estado: null,
      codec: null,
      detalle: fraseDeEleccion(eleccion),
      canal: '(sin canal)',
      puerto: video.puerto,
      origenDelCanal: 'sin_canal',
      sustituido: null,
    };
  }
  const r = await describirRtsp({
    host: opciones.host,
    puerto: video.puerto,
    camino: caminoRtspDe(eleccion.canal),
    usuario: opciones.usuario,
    clave: opciones.clave,
  });
  return {
    ...r,
    canal: eleccion.canal,
    puerto: video.puerto,
    origenDelCanal: eleccion.origen,
    sustituido: eleccion.sustituido,
  };
};

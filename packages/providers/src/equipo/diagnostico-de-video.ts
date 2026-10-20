import type { DiagnosticoDeVideo } from '../nucleo/video';
import type { ResultadoRtsp } from './rtsp-describe';
import { pasosParaH264 } from '../nucleo/errores';
import { REMEDIOS_DE_VIDEO } from '../nucleo/via-de-video';

/**
 * D-73 · EL 401 DE RTSP NO SIGNIFICA «CREDENCIAL MALA»
 *
 * Visto en sitio el 19/10 con el DS-KD9633-WBE6. La sonda pedía el canal 102,
 * el equipo contestaba 401 en un intercambio Digest limpio, y esta frase decía
 * «rechazó la credencial: revise el permiso de vista en vivo». Dos días por
 * ese camino. Lo que ocurría es que ese modelo **no tiene subflujo**: con el
 * MISMO usuario y la MISMA clave, `ffmpeg` entró al canal 101 a la primera y
 * sirvió H.264 1920x1080. El equipo contesta 401 a un canal que no existe, en
 * vez del 404 que correspondería.
 *
 * Por eso la frase nombra ahora las dos causas y pone **el canal primero**:
 * es la más probable cuando la credencial ya funciona por HTTP, y es la que se
 * comprueba sin tocar el equipo —se cambia en la ficha de la consola—.
 *
 * V5 (15-N) · de la respuesta RTSP del equipo a una causa y una frase.
 *
 * Una más que las de la sonda: `solo_sha256`. go2rtc v1.9.14 sólo responde
 * Digest MD5 (medido con el binario oficial contra un equipo simulado que sólo
 * ofrece SHA-256: «streams: wrong user/pass»). Si el equipo no ofrece MD5, el
 * puente no entra aunque la clave sea buena y la sonda sí entre.
 */
export const diagnosticoDeVideoDesde = (canal: string, r: ResultadoRtsp): DiagnosticoDeVideo => {
  const soloSha256 =
    r.ofrecido !== undefined && /SHA-256/.test(r.ofrecido) && !/algorithm=MD5/.test(r.ofrecido);
  if (r.clase === 'respondio' && soloSha256) {
    return {
      canal,
      causa: 'solo_sha256',
      codec: r.codec,
      frase:
        `el equipo sólo acepta Digest SHA-256 por RTSP y el puente de video sólo sabe MD5: ` +
        'en el equipo, ponga la autenticación RTSP en «digest» con algoritmo MD5 (o MD5/SHA256)',
    };
  }
  if (r.clase === 'respondio') {
    return r.codec === 'H.264'
      ? {
          canal,
          causa: 'ninguna',
          codec: r.codec,
          frase: `el equipo entrega H.264 en el canal ${canal}`,
        }
      : {
          canal,
          causa: 'codec',
          codec: r.codec,
          // A4 (15-S2) · con los tres remedios: Safari, ffmpeg o H.264 en el equipo.
          frase:
            `el equipo entrega ${r.codec ?? 'un códec ilegible'} en el canal ${canal} y este ` +
            `navegador no lo recibe. ${REMEDIOS_DE_VIDEO} Para (3): ${pasosParaH264(canal)}`,
        };
  }
  if (r.clase === 'credencial') {
    return {
      canal,
      causa: 'credencial',
      codec: null,
      frase:
        `el equipo contestó 401 por RTSP en el canal ${canal} con la MISMA credencial que ` +
        'acepta por HTTP, y eso tiene dos causas posibles. Pruebe en este orden: (1) el canal ' +
        `no existe en este modelo —algunos contestan 401 en vez de 404—: cambie el canal en la ` +
        'ficha del equipo (el x01 es el principal y existe siempre; el x02 es el subflujo y ' +
        'muchos videoporteros no lo tienen); (2) el usuario de servicio no tiene permiso de ' +
        `vista en vivo: actívelo en el panel del equipo · ${r.detalle}`,
    };
  }
  if (r.clase === 'rechazo') {
    const causa =
      r.causa === 'sin_permiso' || r.causa === 'sin_canal' || r.causa === 'sesion'
        ? r.causa
        : 'otro';
    return { canal, causa, codec: null, frase: r.detalle };
  }
  return {
    canal,
    causa: 'inalcanzable',
    codec: null,
    frase: `el equipo no contesta por RTSP: ${r.detalle}`,
  };
};

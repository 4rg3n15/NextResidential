import { Socket } from 'node:net';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * V5 (15-N) · EL OPERADOR EN OTRO EQUIPO DE LA LAN
 *
 * La consola negocia por la API, pero el MEDIO viaja directo del Mac al
 * navegador: al candidato que go2rtc anuncia (`VIDEO_IP_ANUNCIADA` o la IP del
 * Mac) y a su puerto WebRTC (`VIDEO_PUERTO_WEBRTC`, 8555, TCP y UDP). Desde el
 * propio Mac todo funciona aunque ese candidato sea inalcanzable; desde el
 * portátil de la portería, no. Dos comprobaciones:
 *
 *  · la IP anunciada es de ESTE Mac (una IP de otra máquina, o la de una red
 *    que el Mac ya no tiene, deja la negociación hecha y el video en negro);
 *  · ya arrancado go2rtc, el puerto contesta por TCP EN ESA IP (no sólo en el
 *    bucle local). El cortafuegos de macOS puede bloquear las conexiones que
 *    llegan de fuera aunque ésta pase: la guía dice cómo permitir go2rtc.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const candidatoDeEsteEquipo = (ip, interfaces) => {
  const propias = Object.values(interfaces)
    .flatMap((d) => d ?? [])
    .map((d) => d.address);
  if (propias.includes(ip)) {
    return { propio: true, frase: `el medio se anuncia en ${ip}, una dirección de este equipo` };
  }
  return {
    propio: false,
    frase:
      `VIDEO_IP_ANUNCIADA=${ip} no es una dirección de este equipo (tiene ${propias.join(', ') || 'ninguna'}): ` +
      'un operador en otro equipo de la LAN negociará el video y no recibirá imagen. Ponga la IP ' +
      'del Mac en la red del conjunto, o déjela vacía para usar la de su Wi-Fi',
  };
};

/** ¿El puerto WebRTC de go2rtc contesta por TCP en la IP anunciada? */
export const comprobarPuertoWebrtc = (ip, puerto, plazoMs = 1500) =>
  new Promise((resolver) => {
    const socket = new Socket();
    const terminar = (ok, frase) => {
      socket.destroy();
      resolver({ ok, frase });
    };
    socket.setTimeout(plazoMs, () =>
      terminar(false, `el puerto WebRTC ${ip}:${puerto} no contestó en ${plazoMs} ms`),
    );
    socket.once('error', (e) =>
      terminar(
        false,
        `el puerto WebRTC ${ip}:${puerto} no contesta (${e.code ?? e.message}): el operador en ` +
          'otro equipo no recibirá video. Revise VIDEO_IP_ANUNCIADA y que go2rtc escuche en ' +
          'todas las interfaces',
      ),
    );
    socket.connect(puerto, ip, () =>
      terminar(
        true,
        `el puerto WebRTC contesta en ${ip}:${puerto} (TCP). Desde otro equipo, permita go2rtc ` +
          'en el cortafuegos del Mac (TCP y UDP) si el video no llega',
      ),
    );
  });

import { networkInterfaces } from 'node:os';

/**
 * La primera IPv4 de la red local del Mac; `en0` (su Wi-Fi) si la hay. Es la
 * dirección a la que llegan el iPhone, la consola por IP y el servidor de
 * alarma de la cámara. `null` si el Mac no está en ninguna red.
 */
export const ipDelMac = () => {
  const candidatas = Object.entries(networkInterfaces())
    .flatMap(([nombre, direcciones]) =>
      (direcciones ?? [])
        .filter((d) => d.family === 'IPv4' && !d.internal)
        .map((d) => ({ nombre, direccion: d.address })),
    )
    .sort((a, b) => (a.nombre === 'en0' ? -1 : b.nombre === 'en0' ? 1 : 0));
  return candidatas[0]?.direccion ?? null;
};

/**
 * C2 (corrección de la 15-L) · la IP del Mac EN LA RED DE UN EQUIPO —la de la
 * cámara, para su servidor de alarma—: la de la interfaz cuya subred lo
 * contiene, o `ALARM_SERVER_IP_ANUNCIADA`. La decide `ipHaciaElEquipo` del
 * paquete de equipos, la misma regla que la consola; aquí sólo se le pasan las
 * interfaces de este Mac. `ipDelMac` sigue siendo la del iPhone: la primera
 * IPv4 de la Wi-Fi, que es la red por la que llega el teléfono.
 */
export const ipDelMacHacia = (
  ipHaciaElEquipo,
  host,
  anunciada = process.env.ALARM_SERVER_IP_ANUNCIADA,
) => ipHaciaElEquipo(host, networkInterfaces(), anunciada ?? null);

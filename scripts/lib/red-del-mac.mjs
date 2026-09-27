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

import { isIPv4 } from 'node:net';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C2 (corrección de la 15-L) · LA IP DEL MAC QUE VE UN EQUIPO
 *
 * El servidor de alarmas de la cámara lleva una IP: la del Mac en la red de la
 * cámara. Esa IP cambia de la casa al sitio, y un Mac con Wi-Fi y cable tiene
 * dos: la buena es la de la interfaz cuya subred CONTIENE al equipo. La
 * primera IPv4 que aparezca —lo que hacía el ensayo— puede ser la de la otra
 * red, y la cámara publicaría a una dirección que no alcanza.
 *
 * Orden de decisión, y por qué:
 *  1. `ALARM_SERVER_IP_ANUNCIADA` si está definida: quien la escribió sabe
 *     algo que las interfaces no dicen (un NAT, un puente, una VLAN enrutada).
 *  2. La IPv4 del Mac en la MISMA subred que el equipo.
 *  3. Ninguna: se dice por qué, y no se adivina. Escribir en la cámara una IP
 *     que no la alcanza es peor que no escribir nada.
 *
 * Función pura: las interfaces se le pasan (en producción, `networkInterfaces()`
 * de `node:os`), así que se prueba sin red.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface InterfazDeRed {
  readonly address: string;
  readonly netmask: string;
  readonly family: string | number;
  readonly internal: boolean;
}

export type IpHaciaElEquipo =
  | {
      readonly ip: string;
      readonly origen: 'anunciada' | 'subred';
      readonly interfaz: string | null;
    }
  | { readonly ip: null; readonly motivo: string };

const aNumero = (ipv4: string): number =>
  ipv4.split('.').reduce((acc, octeto) => (acc << 8) + Number(octeto), 0) >>> 0;

const esIpv4 = (d: InterfazDeRed): boolean => d.family === 'IPv4' || d.family === 4;

export const mismaSubred = (a: string, b: string, mascara: string): boolean =>
  isIPv4(a) &&
  isIPv4(b) &&
  isIPv4(mascara) &&
  (aNumero(a) & aNumero(mascara)) >>> 0 === (aNumero(b) & aNumero(mascara)) >>> 0;

export const ipHaciaElEquipo = (
  hostDelEquipo: string,
  interfaces: Readonly<Record<string, readonly InterfazDeRed[] | undefined>>,
  anunciada?: string | null,
): IpHaciaElEquipo => {
  const fija = (anunciada ?? '').trim();
  if (fija !== '') {
    return isIPv4(fija)
      ? { ip: fija, origen: 'anunciada', interfaz: null }
      : { ip: null, motivo: `ALARM_SERVER_IP_ANUNCIADA no es una IPv4: «${fija}»` };
  }
  if (!isIPv4(hostDelEquipo)) {
    return {
      ip: null,
      motivo:
        `el equipo está registrado por nombre («${hostDelEquipo}»), no por IP: no se puede saber ` +
        'en qué red está. Defina ALARM_SERVER_IP_ANUNCIADA en el .env de la API',
    };
  }
  for (const [nombre, direcciones] of Object.entries(interfaces)) {
    for (const d of direcciones ?? []) {
      if (!esIpv4(d) || d.internal) continue;
      if (mismaSubred(d.address, hostDelEquipo, d.netmask)) {
        return { ip: d.address, origen: 'subred', interfaz: nombre };
      }
    }
  }
  return {
    ip: null,
    motivo:
      `el Mac no tiene ninguna IP en la red del equipo (${hostDelEquipo}): conéctelo a esa red ` +
      '—por cable o por la Wi-Fi de los equipos— o defina ALARM_SERVER_IP_ANUNCIADA',
  };
};

import { BlockList, isIP } from 'node:net';
import type { ReglasDeIp } from './puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H4 (15-L) · DÓNDE PUEDE ENTRAR UN PORTERO. Pura: sin base, sin reloj.
 *
 *  a · Guardia remota sólo desde una IP (o red) de la lista remota.
 *  b · Con la lista remota VACÍA, desde la IP de una sesión activa de un
 *      superadministrador (regla de transición del cliente). En cuanto la
 *      lista tenga una entrada, esta regla deja de aplicar.
 *  · Desde la IP del computador de portería, la consola presencial —pero NO
 *    lo que es sólo de guardia remota (`soloRemota`)—.
 *  c/d · Sólo al portero: quien llama a esto ya lo sabe.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const MENSAJE_GUARDIA_REMOTA = 'No autorizado para guardia remota';

/** `::ffff:192.0.2.1` → `192.0.2.1`. */
export const ipNormalizada = (ip: string): string => ip.trim().replace(/^::ffff:/i, '');

/** ¿Está `ip` en alguna de estas IP o redes CIDR? Lo ilegible, no. */
export const ipEnRedes = (ip: string, redes: readonly string[]): boolean => {
  const buscada = ipNormalizada(ip);
  const familia = isIP(buscada);
  if (familia === 0) return false;
  const lista = new BlockList();
  for (const red of redes) {
    const [direccion = '', prefijo] = ipNormalizada(red).split('/');
    const tipo = isIP(direccion);
    if (tipo === 0) continue;
    const nombre = tipo === 4 ? 'ipv4' : 'ipv6';
    if (prefijo === undefined) lista.addAddress(direccion, nombre);
    else lista.addSubnet(direccion, Number(prefijo), nombre);
  }
  return lista.check(buscada, familia === 4 ? 'ipv4' : 'ipv6');
};

export type ViaDeEntrada = 'remota' | 'superadministrador' | 'porteria';

export interface VeredictoDeIp {
  readonly permitido: boolean;
  readonly via: ViaDeEntrada | null;
}

export const evaluarIpDePortero = (e: {
  readonly ip: string | null;
  readonly reglas: ReglasDeIp;
  readonly ipsDeSuperadministrador: readonly string[];
  readonly soloRemota: boolean;
}): VeredictoDeIp => {
  if (e.ip === null || isIP(ipNormalizada(e.ip)) === 0) return { permitido: false, via: null };
  if (e.reglas.ipsRemotas.length > 0) {
    if (ipEnRedes(e.ip, e.reglas.ipsRemotas)) return { permitido: true, via: 'remota' };
  } else if (ipEnRedes(e.ip, e.ipsDeSuperadministrador)) {
    return { permitido: true, via: 'superadministrador' };
  }
  if (!e.soloRemota && ipEnRedes(e.ip, e.reglas.ipsPorteria)) {
    return { permitido: true, via: 'porteria' };
  }
  return { permitido: false, via: null };
};

/** Una IP o red CIDR bien escrita, normalizada; `null` si no lo es. */
export const redValida = (texto: string): string | null => {
  const [direccion = '', prefijo, sobra] = texto.trim().split('/');
  if (sobra !== undefined) return null;
  const tipo = isIP(direccion);
  if (tipo === 0) return null;
  if (prefijo === undefined) return direccion.toLowerCase();
  if (!/^\d{1,3}$/.test(prefijo)) return null;
  const bits = Number(prefijo);
  if (bits > (tipo === 4 ? 32 : 128)) return null;
  return `${direccion.toLowerCase()}/${String(bits)}`;
};

import { BlockList, isIP } from 'node:net';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UNA SOLA NORMALIZACIÓN DE DIRECCIONES IP PARA TODA LA API
 *
 * Hasta la 15-L la misma expresión —quitar el `::ffff:` que ponen los sockets
 * de doble pila— estaba escrita en cuatro sitios: el Alarm Server, la regla de
 * IP de los porteros y los dos adaptadores de la plataforma. Cuatro copias de
 * una regla se separan en cuanto una cambia, y la de los porteros tenía que
 * cambiar (ítem 9 de la corrección de la 15-L): en el Mac la consola llega por
 * `::1` y la lista de portería dice `127.0.0.1`, o al revés, y el portero se
 * quedaba fuera desde la misma máquina.
 *
 *  · `normalizarOrigen` — sin espacios, en minúsculas y sin `::ffff:`. La usan
 *    todos; su comportamiento es el de siempre.
 *  · `direccionComparable` — además, el BUCLE LOCAL en una sola grafía:
 *    `::1`, `127.0.0.1` y `::ffff:127.0.0.1` son la misma máquina. La usa la
 *    regla de IP de los porteros, en los dos lados de la comparación.
 *  · `redComparable` — lo mismo para una entrada de la lista (IP o red CIDR),
 *    con el prefijo traducido cuando la familia cambia.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const MAPEADA = /^::ffff:(.+)$/i;

/**
 * Normaliza el origen: IPv6 con IPv4 dentro, y el `::ffff:` de los sockets.
 * `[SUPUESTO]` S-105 · lo que se GUARDA (auditoría, intentos por IP) pasa por
 * aquí y no por `direccionComparable`: juntar el bucle local cambiaría qué
 * significa una fila ya escrita y cómo se cuentan los fallos por dirección.
 */
export const normalizarOrigen = (crudo: string | undefined | null): string => {
  const valor = (crudo ?? '').trim();
  const sinPrefijo = MAPEADA.exec(valor)?.[1] ?? valor;
  return sinPrefijo.toLowerCase();
};

/** El bucle local, en la grafía única con que se compara. */
export const BUCLE_LOCAL = '127.0.0.1';

const BUCLE_LOCAL_V6 = new BlockList();
BUCLE_LOCAL_V6.addAddress('::1', 'ipv6');

/**
 * `::1` (en cualquier grafía), `127.0.0.1` y `::ffff:127.0.0.1` → `127.0.0.1`.
 * `[SUPUESTO]` S-100 · sólo esas tres son la misma máquina: el resto del
 * bloque del bucle local sigue siendo otra dirección, porque nadie lo pidió y
 * abrir la guarda de IP a una red entera sería lo contrario de lo conservador.
 */
export const direccionComparable = (crudo: string | undefined | null): string => {
  const d = normalizarOrigen(crudo);
  return isIP(d) === 6 && BUCLE_LOCAL_V6.check(d, 'ipv6') ? BUCLE_LOCAL : d;
};

export interface RedComparable {
  readonly direccion: string;
  readonly familia: 'ipv4' | 'ipv6';
  /** `null`: una sola dirección, no una red. */
  readonly prefijo: number | null;
}

/**
 * Una entrada de la lista en su forma comparable; `null` si es ilegible.
 *
 * Si la normalización la pasa de IPv6 a IPv4, el prefijo pierde los 96 bits de
 * delante: `::ffff:192.0.2.0/120` es `192.0.2.0/24`, y `::1/128` es
 * `127.0.0.1/32`. Una red que no cabe en esa traducción —`::ffff:0:0/64`,
 * `::1/100`— se queda en IPv6 tal cual: agrandarla o encogerla sería
 * inventarse una lista que nadie escribió.
 */
export const redComparable = (texto: string): RedComparable | null => {
  const [cruda = '', prefijoTexto, sobra] = texto.trim().split('/');
  const original = cruda.trim().toLowerCase();
  const tipo = isIP(original);
  if (sobra !== undefined || tipo === 0) return null;
  let prefijo: number | null = null;
  if (prefijoTexto !== undefined) {
    if (!/^\d{1,3}$/.test(prefijoTexto)) return null;
    prefijo = Number(prefijoTexto);
    if (prefijo > (tipo === 4 ? 32 : 128)) return null;
  }
  const direccion = direccionComparable(original);
  const familia = isIP(direccion);
  if (familia === 0) return null;
  if (familia === tipo) return { direccion, familia: tipo === 4 ? 'ipv4' : 'ipv6', prefijo };
  if (prefijo === null) return { direccion, familia: 'ipv4', prefijo };
  const traducible = MAPEADA.test(original) ? prefijo >= 96 : prefijo === 128;
  return traducible
    ? { direccion, familia: 'ipv4', prefijo: prefijo - 96 }
    : { direccion: original, familia: 'ipv6', prefijo };
};

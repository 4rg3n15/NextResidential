/**
 * H6 (15-L) · quién es el cliente de la consola, sin creer lo que él diga.
 *
 * La dirección es la del SOCKET. Sólo si el socket es un proxy declarado de
 * confianza (`CONSOLA_PROXIES_DE_CONFIANZA`) se toma la primera IP de la
 * `X-Forwarded-For` que ese proxy trae. Todo lo demás se ignora.
 */

/** `::ffff:192.0.2.1` → `192.0.2.1`: la misma dirección, escrita como IPv4. */
const normalizada = (ip) =>
  String(ip ?? '')
    .trim()
    .replace(/^::ffff:/, '');

/** `"a, b"` → `Set {a, b}`. Vacía: ningún proxy delante. */
export const proxiesDeConfianza = (texto) =>
  new Set(
    String(texto ?? '')
      .split(',')
      .map(normalizada)
      .filter((s) => s !== ''),
  );

export const ipDelCliente = (socket, cabecera, deConfianza) => {
  const directa = normalizada(socket);
  if (!deConfianza.has(directa)) return directa;
  const primera = normalizada(
    String(Array.isArray(cabecera) ? cabecera[0] : (cabecera ?? '')).split(',')[0],
  );
  return primera === '' ? directa : primera;
};

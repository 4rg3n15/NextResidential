export { SERVICIOS_DE_PUSH_POR_OMISION } from '../configuracion/esquema-de-avisos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A QUIÉN LE ENVÍA LA API · la lista blanca de servicios de push
 *
 * El endpoint de una suscripción lo entrega el NAVEGADOR del residente, es
 * decir, un cliente. Sin lista blanca, la API haría un POST a cualquier URL
 * que alguien registrara: `http://metadata.google.internal/…`, un servicio interno de
 * la VPC, el panel de un equipo. Eso es SSRF, y se cierra aquí —al registrar Y
 * al enviar— admitiendo sólo los servicios de push de los navegadores:
 *
 *   · fcm.googleapis.com          Chrome y los derivados de Chromium
 *   · push.services.mozilla.com   Firefox
 *   · push.apple.com              Safari (macOS e iPhone 16.4+, instalada)
 *   · notify.windows.com          Edge
 *
 * Que Chrome entregue por `fcm.googleapis.com` no es usar Firebase: no hay
 * proyecto, ni SDK, ni llave de servidor de Google; la credencial es VAPID y
 * el contenido viaja cifrado de extremo a extremo (RFC 8291). Ver ADR-036.
 *
 * HTTPS siempre, salvo un servicio de prueba en la propia máquina FUERA de
 * producción (la suite levanta uno en 127.0.0.1).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const LOCALES = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Largo máximo de un endpoint; coincide con el `token` de la tabla (0030). */
export const LARGO_MAXIMO_DE_ENDPOINT = 4096;

export const esServicioDePushPermitido = (
  endpoint: string,
  permitidos: readonly string[],
  produccion: boolean,
): boolean => {
  if (endpoint.length > LARGO_MAXIMO_DE_ENDPOINT) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.username !== '' || url.password !== '') return false;
  const host = url.hostname.toLowerCase();
  const enLista = permitidos.some((s) => host === s || host.endsWith(`.${s}`));
  if (!enLista) return false;
  if (url.protocol === 'https:') return url.port === '' || url.port === '443';
  return url.protocol === 'http:' && !produccion && LOCALES.has(host);
};

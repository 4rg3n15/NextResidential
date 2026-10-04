import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · D4 · LA IP DEL NAVEGADOR CUANDO LA CONSOLA NO ES UN PROXY CONOCIDO
 *
 * En sitio la consola es UN proceso con IP fija y la API cree su
 * `X-Forwarded-For` porque está en `API_PROXIES_DE_CONFIANZA` (H6, 15-L). En
 * Netlify (P-20) las peticiones del proxy de la consola salen de direcciones
 * que nadie puede listar, así que esa cadena NO se puede creer: `req.ip` sería
 * la de Netlify y la lista blanca de porteros no serviría.
 *
 * La consola lee la IP SÓLO de la cabecera que su plataforma escribe y el
 * navegador no puede fijar (`CONSOLA_CABECERA_IP_DE_CONFIANZA`), y la manda
 * FIRMADA: `x-ncr-ip-cliente` + `x-ncr-ip-firma` = `<segundos>.<HMAC-SHA256>`
 * con un secreto que sólo comparten los dos servidores (`API_IP_FIRMA_SECRETO`).
 * Aquí, si la firma vale y es de los últimos 60 s, esa IP pasa a ser `req.ip`
 * para todo lo que viene después (límites, lista blanca, auditoría). Sin
 * secreto, o con firma inválida, no cambia nada: manda el `trust proxy`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const CABECERA_IP_DEL_CLIENTE = 'x-ncr-ip-cliente';
export const CABECERA_FIRMA_DE_IP = 'x-ncr-ip-firma';
export const VENTANA_DE_LA_FIRMA_S = 60;

const hmac = (secreto: string, segundos: string, ip: string): Buffer =>
  createHmac('sha256', secreto).update(`${segundos}.${ip}`).digest();

/** La firma que manda la consola; la API la recalcula igual. */
export const firmaDeIp = (secreto: string, ip: string, segundos: number): string =>
  `${String(segundos)}.${hmac(secreto, String(segundos), ip).toString('base64url')}`;

export const ipFirmadaValida = (
  secreto: string,
  ip: string,
  firma: string,
  ahoraS: number,
): boolean => {
  const [segundos = '', mac = ''] = firma.split('.');
  if (!/^\d{1,12}$/.test(segundos) || isIP(ip) === 0) return false;
  if (Math.abs(ahoraS - Number(segundos)) > VENTANA_DE_LA_FIRMA_S) return false;
  const esperado = hmac(secreto, segundos, ip);
  const recibido = Buffer.from(mac, 'base64url');
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
};

interface PeticionConIp {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

const unaDe = (v: string | string[] | undefined): string =>
  (Array.isArray(v) ? '' : (v ?? '')).trim();

/** Middleware de Express: con firma válida, `req.ip` es la IP firmada. */
export const ipFirmada =
  (secreto: string | undefined, ahora: () => number = () => Date.now()) =>
  (peticion: PeticionConIp, _respuesta: unknown, seguir: () => void): void => {
    const ip = unaDe(peticion.headers[CABECERA_IP_DEL_CLIENTE]);
    const firma = unaDe(peticion.headers[CABECERA_FIRMA_DE_IP]);
    if (
      secreto !== undefined &&
      ip !== '' &&
      ipFirmadaValida(secreto, ip, firma, Math.floor(ahora() / 1000))
    ) {
      Object.defineProperty(peticion, 'ip', { value: ip, configurable: true, enumerable: true });
    }
    seguir();
  };

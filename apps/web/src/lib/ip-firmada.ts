import 'server-only';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { despliegue } from './configuracion-de-despliegue';

/**
 * 15-R · D4 · la IP del navegador, firmada para la API. El MISMO algoritmo que
 * `apps/api/src/comun/ip-firmada.ts` (las dos pruebas comparten un vector):
 * `<segundos>.<HMAC-SHA256(secreto, "<segundos>.<ip>") en base64url>`.
 */
export const CABECERA_IP_DEL_CLIENTE = 'x-ncr-ip-cliente';
export const CABECERA_FIRMA_DE_IP = 'x-ncr-ip-firma';

export const firmaDeIp = (secreto: string, ip: string, segundos: number): string =>
  `${String(segundos)}.${createHmac('sha256', secreto)
    .update(`${String(segundos)}.${ip}`)
    .digest('base64url')}`;

/**
 * La IP del navegador según el despliegue: de la cabecera de confianza si está
 * declarada (Netlify) —y SÓLO de ella—; si no, la primera de `X-Forwarded-For`,
 * que en sitio escribió `servidor.mjs` con la IP del socket (H6).
 */
export const ipDelNavegador = (cabeceras: Headers): string | null => {
  const propia = despliegue().cabeceraIpDeConfianza;
  const valor =
    propia === undefined
      ? cabeceras.get('x-forwarded-for')?.split(',')[0]
      : cabeceras.get(propia)?.split(',')[0];
  const ip = valor?.trim() ?? '';
  return ip === '' || (propia !== undefined && isIP(ip) === 0) ? null : ip;
};

/** Las cabeceras de la firma, o ninguna si no hay secreto (sitio). */
export const firmaParaLaApi = (ip: string, ahora: number = Date.now()): Record<string, string> => {
  const secreto = despliegue().ipFirmaSecreto;
  if (secreto === undefined) return {};
  return {
    [CABECERA_IP_DEL_CLIENTE]: ip,
    [CABECERA_FIRMA_DE_IP]: firmaDeIp(secreto, ip, Math.floor(ahora / 1000)),
  };
};

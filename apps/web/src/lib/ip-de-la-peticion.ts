import { firmaParaLaApi, ipDelNavegador } from './ip-firmada';

/**
 * H6 (15-L) · la IP del navegador, hacia la API: el proxy `/api/ncr`, el inicio
 * de sesión y el cambio de contraseña se la pasan. En sitio la API la cree por
 * venir del proxy propio; con la consola en Netlify (15-R, D4) va además
 * FIRMADA y sale sólo de la cabecera de confianza (`ip-firmada.ts`).
 */
export const ipDe = (cabeceras: Headers): string | null => ipDelNavegador(cabeceras);

/** Las cabeceras a reenviar, o ninguna. */
export const reenvioDeIp = (cabeceras: Headers): Record<string, string> => {
  const ip = ipDe(cabeceras);
  return ip === null ? {} : { 'x-forwarded-for': ip, ...firmaParaLaApi(ip) };
};

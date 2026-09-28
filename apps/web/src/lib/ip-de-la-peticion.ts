/**
 * H6 (ETAPA 15-L) · la IP del navegador, hacia la API.
 *
 * `servidor.mjs` deja en `X-Forwarded-For` la IP del SOCKET del navegador (la
 * que él mande se descarta). Todo lo que la consola pide a la API en nombre de
 * una persona —el proxy `/api/ncr`, el inicio de sesión, el cambio de
 * contraseña— se la pasa, y la API la cree porque le llega del proxy propio.
 * Sin esto la API veía 127.0.0.1 en toda petición de la consola.
 */
export const ipDe = (cabeceras: Headers): string | null => {
  const primera = cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  return primera === '' ? null : primera;
};

/** La cabecera a reenviar, o ninguna. */
export const reenvioDeIp = (cabeceras: Headers): Record<string, string> => {
  const ip = ipDe(cabeceras);
  return ip === null ? {} : { 'x-forwarded-for': ip };
};

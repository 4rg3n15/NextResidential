/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-10 · ¿LA URL PÚBLICA LA ALCANZA UN TELÉFONO?
 *
 * En sitio, con el proveedor real, `API_URL_PUBLICA` era `http://127.0.0.1:3000`.
 * El enlace del consentimiento y su QR se construyeron con esa dirección y
 * ningún teléfono los abrió: `127.0.0.1` es el propio teléfono. El error no se
 * vio hasta que el titular lo escaneó delante del portero.
 *
 * Esto clasifica la URL; el arranque lo avisa y la consola lo escribe junto al
 * enlace. No decide nada: la dirección correcta la sabe quien instala.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type AlcanceDeLaUrlPublica = 'ausente' | 'bucle_local' | 'alcanzable';

const ES_BUCLE_LOCAL = (host: string): boolean => {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h === '::1' ||
    h === '0.0.0.0' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)
  );
};

export const alcanceDeLaUrlPublica = (url: string | null | undefined): AlcanceDeLaUrlPublica => {
  if (url === null || url === undefined || url.trim() === '') return 'ausente';
  try {
    return ES_BUCLE_LOCAL(new URL(url).hostname) ? 'bucle_local' : 'alcanzable';
  } catch {
    return 'ausente';
  }
};

export const AVISO_DE_BUCLE_LOCAL =
  'API_URL_PUBLICA apunta al bucle local (127.0.0.1 / localhost): los enlaces y QR del ' +
  'consentimiento NO los abre ningún teléfono. Declare la IP del equipo en la red del conjunto ' +
  '(http://<IP>:3000).';

/**
 * Avisos de arranque por la URL pública. Sólo con el proveedor REAL es un
 * error: con el simulado nadie escanea un QR delante de un equipo.
 */
export const avisoDeUrlPublica = (config: {
  readonly PROVEEDOR_DE_EQUIPOS: string;
  readonly API_URL_PUBLICA?: string | undefined;
}): string | null =>
  config.PROVEEDOR_DE_EQUIPOS !== 'simulado' &&
  alcanceDeLaUrlPublica(config.API_URL_PUBLICA) === 'bucle_local'
    ? AVISO_DE_BUCLE_LOCAL
    : null;

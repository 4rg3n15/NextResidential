/**
 * Política de reconexión del canal en vivo: **exponencial con jitter**.
 *
 * Aislada y pura para poder probarla. El jitter no es un adorno: si veinticinco
 * consolas pierden la conexión a la vez —lo normal, porque la pierden por lo
 * mismo—, un backoff determinista las hace reintentar en el mismo instante y
 * la API recibe veinticinco reconexiones simultáneas justo cuando se está
 * recuperando. El limitador de peticiones (§2.7.5) las contaría como una
 * ráfaga y devolvería 429, alargando la caída.
 *
 * Se usa jitter «completo» —un valor uniforme entre 0 y el tope— y no un ±10 %:
 * con el margen estrecho las reconexiones siguen agrupadas, solo que un poco
 * más anchas.
 */

export const ESPERA_BASE_MS = 1_000;
export const ESPERA_MAXIMA_MS = 30_000;

export const esperaDeReintento = (
  intento: number,
  aleatorio: () => number = Math.random,
): number => {
  if (intento <= 0) return 0;
  const tope = Math.min(ESPERA_MAXIMA_MS, ESPERA_BASE_MS * 2 ** (intento - 1));
  // Un mínimo de 250 ms evita el reintento inmediato que produciría un
  // `aleatorio()` cercano a cero: sin él, el primer reintento podría salir a
  // los 3 ms y convertir un corte en un bucle cerrado.
  return Math.max(250, Math.round(tope * aleatorio()));
};

/**
 * Instante en que conviene renovar el flujo por vencimiento del token, no por
 * fallo. Se adelanta 45 s a la expiración: la reconexión tarda, y hacerla justo
 * en el borde deja un hueco en el que el flujo ya no entrega y el nuevo aún no
 * está abierto.
 */
export const MARGEN_RENOVACION_MS = 45_000;

export const msHastaRenovar = (expiraEnSegundos: number | null, ahoraMs: number): number | null => {
  if (expiraEnSegundos === null) return null;
  return Math.max(5_000, expiraEnSegundos * 1000 - ahoraMs - MARGEN_RENOVACION_MS);
};

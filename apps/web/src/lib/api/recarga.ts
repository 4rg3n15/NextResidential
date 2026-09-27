/**
 * 3h (corrección de la 15-L) · LAS LISTAS QUE COMPARTEN LA APP Y LA CONSOLA.
 *
 * Lo que el residente cambia en la app —una visita, un vehículo, su perfil—
 * vive en la misma API que lee la consola. Estas listas se vuelven a pedir al
 * recuperar el foco de la ventana SIEMPRE (no sólo si el dato «envejeció») y
 * cada 15 s mientras la pestaña está visible, para que el cambio aparezca sin
 * recargar la página. En segundo plano no se piden: TanStack Query pausa el
 * intervalo cuando la pestaña no está visible.
 */
export const INTERVALO_DE_LISTAS_COMPARTIDAS_MS = 15_000;

export const RECARGA_DE_LISTAS_COMPARTIDAS = {
  refetchOnWindowFocus: 'always',
  refetchInterval: INTERVALO_DE_LISTAS_COMPARTIDAS_MS,
  refetchIntervalInBackground: false,
} as const;

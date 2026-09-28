/** Una respuesta como la del equipo, sin red: lo que devuelve el `fetch` simulado. */
export const respuestaDe = (
  estado: number,
  cuerpo: string,
  cabeceras: Record<string, string> = {},
): Response =>
  ({
    status: estado,
    ok: estado >= 200 && estado < 300,
    headers: new Headers(cabeceras),
    text: async () => cuerpo,
    body: null,
  }) as unknown as Response;

/**
 * ¿Casa la ruta del catálogo con el camino pedido? Las rutas con `{canal}` se
 * comparan como patrón: el simulado acepta cualquier número, igual que el
 * aparato acepta cualquier canal que exista. Qué canal era el bueno lo decide
 * la prueba mirando la petición, no el emparejamiento.
 */
export const caminoCasa = (rutaDelCatalogo: string, camino: string): boolean => {
  const base = rutaDelCatalogo.split('?')[0] ?? rutaDelCatalogo;
  if (!base.includes('{canal}')) return base === camino;
  const patron = new RegExp(
    '^' +
      base
        .split('{canal}')
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\d+') +
      '$',
  );
  return patron.test(camino);
};

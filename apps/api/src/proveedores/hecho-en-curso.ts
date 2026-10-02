import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 15-Q2 · B2 · el hecho del Edge que la API está decidiendo AHORA.
 *
 * Cuando el Edge reenvía un hecho por el túnel, la API lo ingiere dentro de
 * este contexto; toda orden que esa decisión produzca (abrir la barrera,
 * contestar a la terminal) sale con el hecho como `padre`. Si el Edge ya lo
 * resolvió por su cuenta —se le venció el plazo esperando a la nube—, rechaza
 * la orden: la barrera recibe UNA, nunca dos (un solo actor).
 *
 * `AsyncLocalStorage` y no un parámetro: la orden nace varias capas más abajo
 * (ingestor → registrar acceso → accionador → proveedor) y ninguna de ellas
 * debe saber que existe un Edge.
 */
const almacen = new AsyncLocalStorage<{ readonly hecho: string }>();

export const enHechoDelEdge = <T>(hecho: string, decidir: () => Promise<T>): Promise<T> =>
  almacen.run({ hecho }, decidir);

export const hechoEnCurso = (): string | undefined => almacen.getStore()?.hecho;

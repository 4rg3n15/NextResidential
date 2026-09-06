/**
 * `Resultado` — el canal de error del dominio.
 *
 * §2.4 prohíbe lanzar strings y devolver `null` como señal de negocio. Una
 * excepción es un salto invisible en la firma: `evaluarAcceso(...): Decision`
 * no dice que pueda fallar. `Resultado<T, E>` lo dice en el tipo, y el
 * compilador obliga a tratar el fallo antes de leer el valor.
 *
 * El fallo esperado (una regla que niega) NO es una excepción: es un valor.
 * Las excepciones quedan para lo que nadie previó.
 */
export type Resultado<T, E> = Exito<T> | Fallo<E>;

export interface Exito<T> {
  readonly ok: true;
  readonly valor: T;
}
export interface Fallo<E> {
  readonly ok: false;
  readonly error: E;
}

export const exito = <T>(valor: T): Exito<T> => ({ ok: true, valor });
export const fallo = <E>(error: E): Fallo<E> => ({ ok: false, error });

export const esExito = <T, E>(r: Resultado<T, E>): r is Exito<T> => r.ok;
export const esFallo = <T, E>(r: Resultado<T, E>): r is Fallo<E> => !r.ok;

/** Transforma el valor y deja el fallo intacto. */
export const mapear = <T, U, E>(r: Resultado<T, E>, f: (v: T) => U): Resultado<U, E> =>
  r.ok ? exito(f(r.valor)) : r;

/** Encadena operaciones que a su vez pueden fallar. Corta en el primer fallo. */
export const encadenar = <T, U, E>(
  r: Resultado<T, E>,
  f: (v: T) => Resultado<U, E>,
): Resultado<U, E> => (r.ok ? f(r.valor) : r);

/** Transforma el error y deja el éxito intacto. */
export const mapearError = <T, E, F>(r: Resultado<T, E>, f: (e: E) => F): Resultado<T, F> =>
  r.ok ? r : fallo(f(r.error));

/**
 * Colapsa las dos ramas. Es la única forma de salir de un `Resultado`, y por
 * eso obliga a decidir qué hacer con el fallo: no hay `.valor` a secas.
 */
export const plegar = <T, E, U>(
  r: Resultado<T, E>,
  alExito: (v: T) => U,
  alFallo: (e: E) => U,
): U => (r.ok ? alExito(r.valor) : alFallo(r.error));

/** Combina una lista; devuelve el primer fallo o todos los valores. */
export const combinar = <T, E>(rs: readonly Resultado<T, E>[]): Resultado<readonly T[], E> => {
  const valores: T[] = [];
  for (const r of rs) {
    if (!r.ok) return r;
    valores.push(r.valor);
  }
  return exito(valores);
};

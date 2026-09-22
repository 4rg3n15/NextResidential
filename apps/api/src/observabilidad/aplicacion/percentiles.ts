/**
 * Percentiles, como función pura y con el método escrito.
 *
 * **Por qué el método se declara.** «p95» no es una operación única: el
 * percentil más cercano, la interpolación lineal y el método de Excel dan tres
 * cifras distintas sobre las mismas muestras, y un tablero que no dice cuál usa
 * no es comparable con nada —ni consigo mismo entre dos versiones—.
 *
 * Aquí se usa el **percentil más cercano con redondeo hacia arriba**
 * (`ceil(p/100 · n) - 1` sobre la muestra ordenada), que es el criterio de los
 * cuantiles de latencia de la industria: **nunca devuelve un valor que no se
 * haya medido**. Interpolar inventaría una latencia que nadie experimentó, y en
 * un indicador que se compara contra un techo eso es precisamente lo que no se
 * quiere: la muestra que incumple tiene que poder verse.
 *
 * Cero muestras devuelve `null` y no `0`. Son cosas distintas —«no ha pasado
 * nada» contra «pasó y tardó nada»— y confundirlas es cómo un tablero recién
 * arrancado se lee como si estuviera cumpliendo.
 */
export const percentil = (ordenadas: readonly number[], p: number): number | null => {
  if (ordenadas.length === 0) return null;
  if (p <= 0) return ordenadas[0] ?? null;
  if (p >= 100) return ordenadas[ordenadas.length - 1] ?? null;
  const indice = Math.ceil((p / 100) * ordenadas.length) - 1;
  const acotado = Math.min(Math.max(indice, 0), ordenadas.length - 1);
  return ordenadas[acotado] ?? null;
};

export interface ResumenDeMuestras {
  readonly muestras: number;
  readonly p50: number | null;
  readonly p95: number | null;
  readonly p99: number | null;
  readonly maximo: number | null;
}

/**
 * Ordena UNA copia. Ordenar el búfer del registro en el sitio destruiría el
 * orden de llegada, que es lo que hace que el anillo descarte la muestra más
 * antigua y no una cualquiera.
 */
export const resumirMuestras = (muestras: readonly number[]): ResumenDeMuestras => {
  const ordenadas = [...muestras].sort((a, b) => a - b);
  return {
    muestras: ordenadas.length,
    p50: percentil(ordenadas, 50),
    p95: percentil(ordenadas, 95),
    p99: percentil(ordenadas, 99),
    maximo: ordenadas.length === 0 ? null : (ordenadas[ordenadas.length - 1] ?? null),
  };
};

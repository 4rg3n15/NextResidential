/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P3 · LAS SALIDAS DE UN EQUIPO: UN ÁRBOL EQUIPO → MÓDULO → SALIDA
 *
 * Un videoportero puede abrir más de una cerradura, tener una unidad de puerta
 * segura en el interior (por RS-485) y periféricos (teclado, lector, placa de
 * nombres). Nada de eso se supone por modelo: se LEE de lo que el equipo
 * declara, y se describe aquí sin nombrar al fabricante.
 *
 * El árbol es la única estructura recursiva de esta ronda (R3), y su
 * profundidad está acotada: equipo (1) → módulo (2) → salida (3). Un árbol más
 * hondo no se recorta en silencio: es un error, porque una salida que no se ve
 * es una puerta que nadie sabe abrir.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type TipoDeNodoDeSalidas = 'equipo' | 'modulo' | 'salida';

export type EstadoDeNodo = 'en_linea' | 'fuera_de_linea' | 'manipulada' | 'averiada';

export interface NodoDeSalidas {
  /** Estable entre lecturas: `propio`, `puerta-1`, `unidad-segura-2`, `submodulo-7`. */
  readonly clave: string;
  readonly tipo: TipoDeNodoDeSalidas;
  readonly nombre: string;
  /** Sólo en una salida: el número de puerta con que el equipo la abre. */
  readonly numeroDePuerta: number | null;
  readonly estado: EstadoDeNodo | null;
  /** Lo que el operador tiene que saber de este nodo, si algo. */
  readonly nota: string | null;
  readonly hijos: readonly NodoDeSalidas[];
}

export const PROFUNDIDAD_MAXIMA_DE_SALIDAS = 3;

export class ArbolDeSalidasDemasiadoHondo extends Error {
  constructor(readonly ruta: string) {
    super(
      `El árbol de salidas pasa de ${String(PROFUNDIDAD_MAXIMA_DE_SALIDAS)} niveles en «${ruta}»: ` +
        'equipo → módulo → salida es todo lo que se admite',
    );
    this.name = 'ArbolDeSalidasDemasiadoHondo';
  }
}

/** Un nodo con su sitio en el árbol: lo que una lista plana necesita para dibujarlo. */
export interface NodoEnElArbol {
  readonly nodo: NodoDeSalidas;
  /** 1 = equipo, 2 = módulo, 3 = salida. */
  readonly nivel: number;
  /** `equipo/propio/puerta-1`: las claves desde la raíz. */
  readonly ruta: string;
  /** La ruta del padre; `null` en la raíz. */
  readonly padre: string | null;
  /** El nombre del nodo padre (`''` en la raíz). */
  readonly nombreDelPadre: string;
}

/**
 * EL ÚNICO RECORRIDO del árbol (R3), en preorden. Dos casos base: una salida
 * es hoja —sus `hijos`, si alguien se los puso, no se recorren— y pasar de
 * `PROFUNDIDAD_MAXIMA_DE_SALIDAS` es un error, no un recorte.
 */
export const recorrerSalidas = (
  nodo: NodoDeSalidas,
  nivel = 1,
  camino: readonly NodoDeSalidas[] = [],
): readonly NodoEnElArbol[] => {
  const claves = [...camino, nodo].map((n) => n.clave);
  const ruta = claves.join('/');
  if (nivel > PROFUNDIDAD_MAXIMA_DE_SALIDAS) throw new ArbolDeSalidasDemasiadoHondo(ruta);
  const aqui: NodoEnElArbol = {
    nodo,
    nivel,
    ruta,
    padre: camino.length === 0 ? null : claves.slice(0, -1).join('/'),
    nombreDelPadre: camino.at(-1)?.nombre ?? '',
  };
  if (nodo.tipo === 'salida') return [aqui];
  return [
    aqui,
    ...nodo.hijos.flatMap((hijo) => recorrerSalidas(hijo, nivel + 1, [...camino, nodo])),
  ];
};

export interface SalidaAplanada {
  /** `equipo/propio/puerta-1`: dónde está la salida en el árbol. */
  readonly ruta: string;
  readonly nombre: string;
  readonly numeroDePuerta: number;
  /** El nombre del módulo que la contiene. */
  readonly modulo: string;
}

/** Las salidas que se pueden ABRIR, en orden: las hojas con número de puerta. */
export const aplanarSalidas = (raiz: NodoDeSalidas): readonly SalidaAplanada[] =>
  recorrerSalidas(raiz).flatMap(({ nodo, ruta, nombreDelPadre }) =>
    nodo.tipo === 'salida' && nodo.numeroDePuerta !== null
      ? [{ ruta, nombre: nodo.nombre, numeroDePuerta: nodo.numeroDePuerta, modulo: nombreDelPadre }]
      : [],
  );

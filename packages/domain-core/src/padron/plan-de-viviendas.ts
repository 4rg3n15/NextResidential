import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

/**
 * Generación del padrón de una copropiedad, como **función pura**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ VIVE EN EL DOMINIO Y NO EN LA API
 *
 * La vista previa y la confirmación llaman a **esta misma función**. No es una
 * comodidad: es la única forma de que lo que el usuario vio y lo que se crea no
 * puedan separarse. Una previsualización calculada en la consola y una
 * generación calculada en el servidor son dos implementaciones del mismo
 * patrón, y el día que discrepen el usuario aprueba una cosa y recibe otra.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * B.1 · LA PREGUNTA QUE FALTABA (ETAPA 15-B) — el plan se invirtió
 *
 * Hasta aquí había TRES planes —apartamentos, casas, fincas— y el de
 * apartamentos, que es el que usa un edificio, **nunca preguntaba cuántas
 * viviendas hay**. Preguntaba cuántas torres, cuántos pisos y cuántas por
 * piso, y la cantidad salía de multiplicar. Quien administra un conjunto sabe
 * que tiene 120 apartamentos; que salgan de 4 × 6 × 5 es una cuenta que tiene
 * que hacer él para poder contestar. Y el denominador —torre, sector,
 * manzana— era obligatorio incluso donde no existe.
 *
 * Queda invertido, y con un solo plan para todos los tipos:
 *
 *   · **El denominador es OPCIONAL.** `agrupaciones = 0` significa que el
 *     conjunto no se divide: las viviendas son sólo número.
 *   · **La cantidad es la pregunta principal.** Sin denominador es el TOTAL;
 *     con denominador es la cantidad **por cada uno**, que es como se describe
 *     un conjunto de verdad («cinco torres de veinticuatro»).
 *   · **Los pisos pasan a ser una forma de NUMERAR, no de contar.** `porPiso`
 *     produce 101, 102, 201… a partir de la cantidad; sin él la numeración es
 *     correlativa. Un edificio de 24 apartamentos con 4 por piso tiene 6
 *     pisos: eso lo deduce el plan, no el usuario.
 *
 * Lo que NO se reabre, porque ya estaba resuelto: la identidad de una vivienda
 * es el par (agrupación, identificador) y la sostiene el índice único compuesto
 * de la base (ADR-04, migración 0029) — la Torre 1 y la Torre 2 tienen las dos
 * un 101—; y la creación ocurre en UNA sola sentencia que se revierte entera si
 * el `RETURNING` devuelve menos filas de las pedidas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE ESTA FUNCIÓN NO DECIDE
 *
 * **La palabra.** Genera `101` y `42`, nunca «Apartamento 101» ni «Casa 42».
 * El prefijo es una etiqueta de la copropiedad que se pinta al mostrar, y por
 * eso cambiarlo después no renombra una sola fila (hallazgo H-3 del diseño).
 *
 * **La unicidad.** La impone el índice único parcial de la base (ADR-04). Aquí
 * solo se detecta el duplicado que el propio plan produciría contra sí mismo,
 * que es un error de FORMULARIO y merece decirse antes de tocar la base.
 */

/** Cotas duras. Juntas y con nombre para poder leerlas de un vistazo. */
export const COTAS = {
  /**
   * Tope por operación. §2.4 prohíbe iterar sobre entrada no acotada del
   * usuario: sin esta cota, «99 torres de 2000» construye un arreglo de
   * doscientas mil cadenas antes de que nadie pueda rechazarlo.
   */
  viviendas: 2_000,
  agrupacionesConLetras: 26,
  agrupacionesConNumeros: 99,
  porPiso: 99,
} as const;

export type EstiloDeAgrupacion = 'letras' | 'numeros';

/**
 * Una agrupación que no sigue la cantidad general. Las urbanizaciones crecen
 * por etapas y casi ninguna es homogénea: la torre 4 tiene 18 y el resto 24.
 */
export interface ExcepcionDeAgrupacion {
  readonly agrupacion: string;
  readonly cantidad: number;
}

export interface PlanDeGeneracion {
  /**
   * Cuántos denominadores hay. **`0` = ninguno**: el conjunto no se divide y
   * las viviendas son sólo número. Es el caso de una parcelación y el de
   * cualquier conjunto pequeño.
   */
  readonly agrupaciones: number;
  /** Cómo se nombran los denominadores. Irrelevante con `agrupaciones = 0`. */
  readonly estilo: EstiloDeAgrupacion;
  /**
   * **La pregunta principal.** Sin denominador, el total de viviendas. Con
   * denominador, cuántas hay **en cada uno**.
   */
  readonly cantidad: number;
  /**
   * Numeración por piso: `piso × 100 + n`. Con 4 por piso y 24 viviendas salen
   * 101…104, 201…204, hasta 601…604. Ausente o `0`, la numeración es
   * correlativa (1, 2, 3…).
   */
  readonly porPiso?: number;
  /** Agrupaciones con una cantidad distinta de la general. */
  readonly excepciones?: readonly ExcepcionDeAgrupacion[];
  /**
   * Con numeración correlativa y varias agrupaciones: ¿la numeración vuelve a
   * empezar en cada una, o sigue corrida? Sin agrupaciones no aplica.
   */
  readonly reiniciarNumeracion?: boolean;
}

export interface ViviendaProyectada {
  readonly agrupacion: string | null;
  readonly identificador: string;
}

/** Lo que la vista previa pinta por grupo: el recuento y los extremos. */
export interface GrupoProyectado {
  readonly agrupacion: string | null;
  readonly cantidad: number;
  readonly primeras: readonly string[];
  readonly ultimas: readonly string[];
  /** `true` si esa agrupación salió de una excepción y no de la cantidad general. */
  readonly porExcepcion: boolean;
}

const malo = (detalle: string): Resultado<never, ErrorDominio> =>
  fallo(errorDominio('DATO_INVALIDO', detalle, 'HU-01'));

const enteroEntre = (
  valor: number,
  minimo: number,
  maximo: number,
  nombre: string,
): string | null => {
  if (!Number.isInteger(valor)) return `${nombre} tiene que ser un número entero`;
  if (valor < minimo) return `${nombre} no puede ser menor que ${String(minimo)}`;
  if (valor > maximo) return `${nombre} no puede pasar de ${String(maximo)}`;
  return null;
};

const excedido = (total: number): string =>
  `El plan genera ${String(total)} viviendas y el máximo por operación es ` +
  `${String(COTAS.viviendas)}. Divídalo en varias generaciones`;

/**
 * Nombre de la agrupación número `indice` (base 0).
 *
 * Con letras se corta en la Z **a propósito**: seguir con «AA» es una regla que
 * nadie espera al escribir «cuántas torres», y un conjunto de 30 torres las
 * numera. Más vale un rechazo con instrucción que una torre llamada AB.
 */
export const nombreDeAgrupacion = (indice: number, estilo: EstiloDeAgrupacion): string =>
  estilo === 'letras' ? String.fromCharCode(65 + indice) : String(indice + 1);

/**
 * Los identificadores de UNA agrupación, dado cuántas viviendas tiene.
 *
 * `desde` es el contador corrido: sólo lo usa la numeración correlativa que no
 * reinicia. Se pasa como argumento en vez de guardarse en una variable de
 * módulo porque esta función tiene que poder llamarse dos veces con el mismo
 * resultado — es lo que hace comparable la vista previa con la confirmación.
 */
const identificadoresDe = (cantidad: number, porPiso: number, desde: number): string[] => {
  if (porPiso > 0) {
    return Array.from({ length: cantidad }, (_, i) => {
      const piso = Math.floor(i / porPiso) + 1;
      const n = (i % porPiso) + 1;
      return String(piso * 100 + n);
    });
  }
  return Array.from({ length: cantidad }, (_, i) => String(desde + i));
};

/** Clave de igualdad de una vivienda proyectada: el par, no el número solo. */
const claveDe = (v: ViviendaProyectada): string =>
  JSON.stringify([v.agrupacion ?? '', v.identificador]);

/**
 * El plan, resuelto. Puro: mismas entradas, mismas salidas, sin reloj y sin E/S.
 */
export const generarPlan = (
  plan: PlanDeGeneracion,
): Resultado<readonly ViviendaProyectada[], ErrorDominio> => {
  const maximoDeAgrupaciones =
    plan.estilo === 'letras' ? COTAS.agrupacionesConLetras : COTAS.agrupacionesConNumeros;
  const porPiso = plan.porPiso ?? 0;

  const problema =
    enteroEntre(plan.agrupaciones, 0, maximoDeAgrupaciones, 'el número de agrupaciones') ??
    enteroEntre(plan.cantidad, 1, COTAS.viviendas, 'la cantidad de viviendas') ??
    (porPiso === 0 ? null : enteroEntre(porPiso, 1, COTAS.porPiso, 'las viviendas por piso'));
  if (problema !== null) return malo(problema);

  const excepciones = plan.excepciones ?? [];
  if (plan.agrupaciones === 0 && excepciones.length > 0) {
    // Sin denominador no hay a qué hacerle una excepción, y aceptarla en
    // silencio generaría el conjunto equivocado sin que nadie lo notase.
    return malo(
      'Hay excepciones pero el conjunto no se divide: sin agrupaciones no hay ' +
        'nada a lo que hacer excepción',
    );
  }

  const nombres =
    plan.agrupaciones === 0
      ? [null]
      : Array.from({ length: plan.agrupaciones }, (_, i) => nombreDeAgrupacion(i, plan.estilo));

  const porAgrupacion = new Map<string | null, number>(nombres.map((n) => [n, plan.cantidad]));
  const vistas = new Set<string>();
  for (const e of excepciones) {
    const nombre = e.agrupacion.trim();
    if (!porAgrupacion.has(nombre)) {
      const primera = nombres[0] ?? '';
      const ultima = nombres[nombres.length - 1] ?? '';
      return malo(
        `La agrupación «${nombre}» no existe: hay ${String(plan.agrupaciones)}, ` +
          `de la ${String(primera)} a la ${String(ultima)}`,
      );
    }
    if (vistas.has(nombre)) {
      return malo(`La agrupación «${nombre}» aparece dos veces en las excepciones`);
    }
    vistas.add(nombre);
    // «0 viviendas» merece su propio mensaje: no es un número fuera de rango,
    // es una agrupación que el usuario cree estar describiendo y en realidad
    // está borrando.
    if (e.cantidad === 0) {
      return malo(
        `Una agrupación con 0 viviendas no es una excepción: es una agrupación ` +
          `que no existe. Revise «${nombre}»`,
      );
    }
    const problemaExcepcion = enteroEntre(
      e.cantidad,
      1,
      COTAS.viviendas,
      `la cantidad de la agrupación «${nombre}»`,
    );
    if (problemaExcepcion !== null) return malo(problemaExcepcion);
    porAgrupacion.set(nombre, e.cantidad);
  }

  // El total se comprueba ANTES de construir el arreglo, no después: la cota
  // existe para que nadie pueda pedirle al proceso que reserve doscientas mil
  // cadenas, y comprobarla sobre el resultado ya construido llegaría tarde.
  const total = [...porAgrupacion.values()].reduce((s, v) => s + v, 0);
  if (total > COTAS.viviendas) return malo(excedido(total));

  const reinicia = plan.agrupaciones === 0 || (plan.reiniciarNumeracion ?? false);
  const proyectadas: ViviendaProyectada[] = [];
  let siguiente = 1;
  for (const nombre of nombres) {
    const cuantas = porAgrupacion.get(nombre) ?? 0;
    for (const identificador of identificadoresDe(cuantas, porPiso, reinicia ? 1 : siguiente)) {
      proyectadas.push({ agrupacion: nombre, identificador });
    }
    siguiente += cuantas;
  }

  /**
   * Duplicado del plan **contra sí mismo**. La base lo rechazaría igual, pero
   * este es un error de formulario —una numeración que reinicia donde no
   * debía— y decirlo aquí lo separa del choque contra un padrón que ya existe,
   * que es otra cosa y se resuelve de otra manera.
   */
  const claves = new Set<string>();
  for (const v of proyectadas) {
    const clave = claveDe(v);
    if (claves.has(clave)) {
      return malo(
        `El plan genera dos veces la misma vivienda (${v.agrupacion ?? 'sin agrupación'} · ` +
          `${v.identificador}). Revise la numeración`,
      );
    }
    claves.add(clave);
  }
  return exito(proyectadas);
};

/**
 * Resumen por grupo para la vista previa: las **dos primeras y las dos
 * últimas** de cada agrupación, y el recuento.
 *
 * Ver las 300 no ayuda; ver que la Torre C acaba en 303 y no en 503 es
 * exactamente lo que detecta un patrón mal puesto.
 */
export const agruparParaVistaPrevia = (
  proyectadas: readonly ViviendaProyectada[],
  excepciones: readonly string[] = [],
): readonly GrupoProyectado[] => {
  const conExcepcion = new Set(excepciones.map((e) => e.trim()));
  const orden: (string | null)[] = [];
  const porGrupo = new Map<string, string[]>();
  for (const v of proyectadas) {
    const clave = v.agrupacion ?? '';
    let lista = porGrupo.get(clave);
    if (lista === undefined) {
      lista = [];
      porGrupo.set(clave, lista);
      orden.push(v.agrupacion);
    }
    lista.push(v.identificador);
  }
  return orden.map((agrupacion) => {
    const lista = porGrupo.get(agrupacion ?? '') ?? [];
    return {
      agrupacion,
      cantidad: lista.length,
      primeras: lista.slice(0, 2),
      // Con cuatro o menos, «primeras» y «últimas» se solaparían y la vista
      // previa repetiría números: ahí no hay nada que resumir.
      ultimas: lista.length > 4 ? lista.slice(-2) : [],
      porExcepcion: agrupacion !== null && conExcepcion.has(agrupacion),
    };
  });
};

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
 * Es el mismo argumento por el que `Documento.normalizarNumero` es público: la
 * consulta y la escritura pasan por el mismo sitio o divergen.
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
   * usuario: sin esta cota, «9999 torres de 99 pisos» construye un arreglo de
   * cien millones de cadenas antes de que nadie pueda rechazarlo.
   */
  viviendas: 2_000,
  torresConLetras: 26,
  torresConNumeros: 99,
  pisos: 50,
  porPiso: 99,
  secciones: 99,
} as const;

export type EstiloDeAgrupacion = 'letras' | 'numeros';

/** Una agrupación que no sigue los valores generales. Las urbanizaciones crecen así. */
export interface ExcepcionDeAgrupacion {
  readonly agrupacion: string;
  readonly pisos: number;
  readonly porPiso: number;
}

export type PlanDeGeneracion =
  | {
      readonly tipo: 'apartamentos';
      readonly agrupaciones: number;
      readonly estilo: EstiloDeAgrupacion;
      readonly pisos: number;
      readonly porPiso: number;
      readonly excepciones?: readonly ExcepcionDeAgrupacion[];
    }
  | {
      readonly tipo: 'casas';
      /** `0` = sin agrupación: las viviendas son solo número. */
      readonly secciones: number;
      readonly total: number;
      readonly reiniciarNumeracion: boolean;
    }
  | { readonly tipo: 'fincas'; readonly cantidad: number };

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
  /** `true` si esa agrupación salió de una excepción y no del patrón general. */
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
 * `piso × 100 + n`. Con 3 por piso y 5 pisos: 101…503. Con 11 por piso:
 * 101…111. Con 10 pisos, el piso 10 da 1001…1011, que sigue siendo legible y
 * es lo que usan los edificios reales.
 */
const numeroDeApartamento = (piso: number, n: number): string => String(piso * 100 + n);

const apartamentos = (
  plan: Extract<PlanDeGeneracion, { tipo: 'apartamentos' }>,
): Resultado<readonly ViviendaProyectada[], ErrorDominio> => {
  const problema =
    enteroEntre(
      plan.agrupaciones,
      1,
      plan.estilo === 'letras' ? COTAS.torresConLetras : COTAS.torresConNumeros,
      'el número de agrupaciones',
    ) ??
    enteroEntre(plan.pisos, 1, COTAS.pisos, 'el número de pisos') ??
    enteroEntre(plan.porPiso, 1, COTAS.porPiso, 'el número de viviendas por piso');
  if (problema !== null) return malo(problema);

  const nombres = Array.from({ length: plan.agrupaciones }, (_, i) =>
    nombreDeAgrupacion(i, plan.estilo),
  );

  // Las excepciones se validan ANTES de generar nada: una excepción sobre una
  // agrupación que no existe es una errata del formulario, y silenciarla
  // generaría el conjunto equivocado sin que nadie lo notase hasta contar.
  const porAgrupacion = new Map<string, { pisos: number; porPiso: number }>(
    nombres.map((n) => [n, { pisos: plan.pisos, porPiso: plan.porPiso }]),
  );
  const vistas = new Set<string>();
  for (const e of plan.excepciones ?? []) {
    const nombre = e.agrupacion.trim();
    if (!porAgrupacion.has(nombre)) {
      const primera = nombres[0] ?? '';
      const ultima = nombres[nombres.length - 1] ?? '';
      return malo(
        `La agrupación «${nombre}» no existe: hay ${String(plan.agrupaciones)}, ` +
          `de la ${primera} a la ${ultima}`,
      );
    }
    if (vistas.has(nombre)) {
      return malo(`La agrupación «${nombre}» aparece dos veces en las excepciones`);
    }
    vistas.add(nombre);
    // «0 pisos» merece su propio mensaje: no es un número fuera de rango, es
    // una agrupación que el usuario cree estar describiendo y en realidad está
    // borrando.
    if (e.pisos === 0 || e.porPiso === 0) {
      return malo(
        `Una agrupación con 0 pisos o 0 viviendas por piso no es una excepción: ` +
          `es una agrupación que no existe. Revise «${nombre}»`,
      );
    }
    const problemaExcepcion =
      enteroEntre(e.pisos, 1, COTAS.pisos, `los pisos de la agrupación «${nombre}»`) ??
      enteroEntre(e.porPiso, 1, COTAS.porPiso, `las viviendas por piso de «${nombre}»`);
    if (problemaExcepcion !== null) return malo(problemaExcepcion);
    porAgrupacion.set(nombre, { pisos: e.pisos, porPiso: e.porPiso });
  }

  // El total se comprueba ANTES de construir el arreglo, no después: la cota
  // existe para que nadie pueda pedirle al proceso que reserve cien millones de
  // cadenas, y comprobarla sobre el resultado ya construido llegaría tarde.
  const total = [...porAgrupacion.values()].reduce((s, v) => s + v.pisos * v.porPiso, 0);
  if (total > COTAS.viviendas) return malo(excedido(total));

  const proyectadas: ViviendaProyectada[] = [];
  for (const nombre of nombres) {
    const medidas = porAgrupacion.get(nombre);
    if (medidas === undefined) continue;
    for (let piso = 1; piso <= medidas.pisos; piso++) {
      for (let n = 1; n <= medidas.porPiso; n++) {
        proyectadas.push({ agrupacion: nombre, identificador: numeroDeApartamento(piso, n) });
      }
    }
  }
  return exito(proyectadas);
};

/**
 * Casas. Reparto **uniforme entre secciones, y el resto en la última**
 * (decisión del usuario, 2026-09-16): 62 casas en 3 secciones dan 20 · 20 · 22.
 * Todo es editable después, y la vista previa lo enseña antes de confirmar.
 */
const casas = (
  plan: Extract<PlanDeGeneracion, { tipo: 'casas' }>,
): Resultado<readonly ViviendaProyectada[], ErrorDominio> => {
  const problema =
    enteroEntre(plan.secciones, 0, COTAS.secciones, 'el número de secciones') ??
    enteroEntre(plan.total, 1, COTAS.viviendas, 'el número de casas');
  if (problema !== null) return malo(problema);
  if (plan.secciones > plan.total) {
    return malo(
      `No se pueden repartir ${String(plan.total)} casas entre ` +
        `${String(plan.secciones)} secciones: alguna quedaría vacía`,
    );
  }

  if (plan.secciones === 0) {
    return exito(
      Array.from({ length: plan.total }, (_, i) => ({
        agrupacion: null,
        identificador: String(i + 1),
      })),
    );
  }

  const porSeccion = Math.floor(plan.total / plan.secciones);
  const proyectadas: ViviendaProyectada[] = [];
  let siguiente = 1;
  for (let s = 1; s <= plan.secciones; s++) {
    // La última carga con el resto: 62 en 3 son 20, 20 y 22.
    const cuantas =
      s === plan.secciones ? plan.total - porSeccion * (plan.secciones - 1) : porSeccion;
    for (let i = 0; i < cuantas; i++) {
      const numero = plan.reiniciarNumeracion ? i + 1 : siguiente;
      proyectadas.push({ agrupacion: String(s), identificador: String(numero) });
      siguiente += 1;
    }
  }
  return exito(proyectadas);
};

const fincas = (
  plan: Extract<PlanDeGeneracion, { tipo: 'fincas' }>,
): Resultado<readonly ViviendaProyectada[], ErrorDominio> => {
  const problema = enteroEntre(plan.cantidad, 1, COTAS.viviendas, 'el número de fincas');
  if (problema !== null) return malo(problema);
  return exito(
    Array.from({ length: plan.cantidad }, (_, i) => ({
      agrupacion: null,
      identificador: String(i + 1),
    })),
  );
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
  const r =
    plan.tipo === 'apartamentos'
      ? apartamentos(plan)
      : plan.tipo === 'casas'
        ? casas(plan)
        : fincas(plan);
  if (!r.ok) return r;
  if (r.valor.length > COTAS.viviendas) return malo(excedido(r.valor.length));

  /**
   * Duplicado del plan **contra sí mismo**. La base lo rechazaría igual, pero
   * este es un error de formulario —dos secciones numeradas igual— y decirlo
   * aquí lo separa del choque contra un padrón que ya existe, que es otra cosa
   * y se resuelve de otra manera.
   */
  const claves = new Set<string>();
  for (const v of r.valor) {
    const clave = claveDe(v);
    if (claves.has(clave)) {
      return malo(
        `El plan genera dos veces la misma vivienda (${v.agrupacion ?? 'sin agrupación'} · ` +
          `${v.identificador}). Revise la numeración`,
      );
    }
    claves.add(clave);
  }
  return exito(r.valor);
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

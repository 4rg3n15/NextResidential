import type { ElementoDeNavegacion } from './navegacion';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-71 · EL REPARTO DE LA NAVEGACIÓN EN UNA PANTALLA DE TELÉFONO
 *
 * Reportado desde el despliegue: en vertical no había menú. `MarcoDeConsola`
 * ocultaba la barra lateral con `hidden md:flex` y no ponía nada en su lugar,
 * así que la navegación sólo existía al girar el teléfono —donde el ancho
 * alcanza los 768 px—. Para el residente, que es quien usa el teléfono, la
 * consola quedaba sin forma de moverse entre sus ocho pantallas.
 *
 * Una barra inferior no puede mostrar nueve o doce entradas: el residente
 * tiene ocho y el administrador más. A 390 px de ancho, seis huecos dan unos
 * 65 px cada uno, que es lo que necesita un blanco táctil cómodo. De ahí el
 * reparto: los primeros caben en la barra y el resto va a «Más».
 *
 * Dos reglas que no son de estilo sino de orientación, y por eso viven en una
 * función pura con prueba en vez de dentro del componente:
 *
 *  1. **La pantalla activa siempre se ve marcada.** Si cae en el grupo «Más»,
 *     es «Más» el que se marca. Sin esto, el residente que está en Perfil no
 *     ve ningún elemento activo y pierde dónde está.
 *  2. **Una entrada no construida no gasta un hueco.** La barra lateral las
 *     muestra deshabilitadas con su etapa, lo que allí es información honesta;
 *     en seis huecos sería tirar uno de seis. Van a «Más», con su etapa.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface RepartoDeNavegacion {
  /** Las que se dibujan en la barra, en el orden de la tabla. */
  readonly enLaBarra: readonly ElementoDeNavegacion[];
  /** Las que se dibujan en el panel «Más». */
  readonly enMas: readonly ElementoDeNavegacion[];
  /** `true` si la pantalla actual está en «Más»: entonces se marca «Más». */
  readonly activaEnMas: boolean;
}

/** Cuántas entradas caben en la barra junto al botón «Más». */
export const HUECOS_DE_LA_BARRA = 5;

/**
 * La ruta activa es la de coincidencia MÁS LARGA, igual que en la barra
 * lateral: con el menú del residente «/mi» es prefijo de «/mi/familia», y sin
 * esto se marcarían dos a la vez.
 */
export const rutaActivaDe = (
  elementos: readonly ElementoDeNavegacion[],
  rutaActual: string,
): string | null =>
  elementos
    .filter((e) => rutaActual === e.ruta || rutaActual.startsWith(`${e.ruta}/`))
    .reduce<
      string | null
    >((mejor, e) => (mejor === null || e.ruta.length > mejor.length ? e.ruta : mejor), null);

export const repartirNavegacion = (
  elementos: readonly ElementoDeNavegacion[],
  rutaActiva: string | null,
  huecos: number = HUECOS_DE_LA_BARRA,
): RepartoDeNavegacion => {
  const disponibles = elementos.filter((e) => e.pendienteDeEtapa === null);
  const pendientes = elementos.filter((e) => e.pendienteDeEtapa !== null);
  // Si todo cabe, no hay «Más» y se usa también su hueco.
  if (pendientes.length === 0 && disponibles.length <= huecos + 1) {
    return { enLaBarra: disponibles, enMas: [], activaEnMas: false };
  }
  const enLaBarra = disponibles.slice(0, huecos);
  const enMas = [...disponibles.slice(huecos), ...pendientes];
  return {
    enLaBarra,
    enMas,
    activaEnMas: rutaActiva !== null && enMas.some((e) => e.ruta === rutaActiva),
  };
};

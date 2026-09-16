import type { ConfiguracionDeCopropiedad } from '@ncr/contracts';

/**
 * Cómo se llaman aquí una vivienda y una agrupación.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PALABRA SE PINTA, NUNCA SE GUARDA (H-3)
 *
 * El identificador guardado es `42`. «Casa» es configuración de la copropiedad
 * y se compone al mostrar. Por eso cambiar el prefijo del conjunto repinta
 * todas estas pantallas y no renombra una sola fila.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HAY UN VALOR DE RESERVA Y NO SE ADIVINA
 *
 * La configuración la leen **solo** los dos roles administrativos. Cuando no
 * está —un portero en el buscador global, o una copropiedad recién creada— no
 * se inventa «Casa»: se usa la palabra neutra. Escribir «Casa 42» en una
 * parcelación de fincas es peor que escribir «42».
 */
export interface Vocabulario {
  readonly vivienda: string;
  readonly agrupacion: string;
}

export const VOCABULARIO_NEUTRO: Vocabulario = { vivienda: 'Vivienda', agrupacion: 'Agrupación' };

/**
 * Campo a campo, con reserva en cada uno. No es paranoia: la configuración la
 * puede negar la API —404 para quien no es administrador— y una pantalla que
 * se cae por una palabra que falta es peor que una pantalla que dice
 * «Vivienda».
 */
export const vocabularioDe = (
  configuracion: ConfiguracionDeCopropiedad | undefined,
): Vocabulario => ({
  vivienda: configuracion?.etiquetaVivienda ?? VOCABULARIO_NEUTRO.vivienda,
  agrupacion: configuracion?.etiquetaAgrupacion ?? VOCABULARIO_NEUTRO.agrupacion,
});

/** «Casa 42 · Manzana B», o «Casa 42» si no hay agrupación. */
export const nombreDeVivienda = (
  vocabulario: Vocabulario,
  identificador: string,
  agrupacion: string | null,
): string => {
  const vivienda = `${vocabulario.vivienda} ${identificador}`.trim();
  return agrupacion === null || agrupacion.trim() === ''
    ? vivienda
    : `${vivienda} · ${vocabulario.agrupacion} ${agrupacion.trim()}`;
};

/** «Manzana B», o «Sin agrupación» para el grupo suelto del directorio. */
export const nombreDeGrupo = (vocabulario: Vocabulario, agrupacion: string | null): string =>
  agrupacion === null || agrupacion.trim() === ''
    ? 'Sin agrupación'
    : `${vocabulario.agrupacion} ${agrupacion.trim()}`;

/**
 * `true` si el conjunto todavía no ha dicho de qué tipo es.
 *
 * Es un estado del SERVIDOR —`tipo` nulo—, no «es la primera sesión» ni una
 * bandera de compilación. Esa diferencia es la lección de D-67 y D-68: lo que
 * depende del caso concreto no se decide por entorno, y así la copropiedad
 * número 40 verá el diálogo el día que entre su administrador, sin que nadie
 * tenga que acordarse.
 */
export const sinConfigurar = (configuracion: ConfiguracionDeCopropiedad | undefined): boolean =>
  configuracion !== undefined && (configuracion.tipo ?? null) === null;

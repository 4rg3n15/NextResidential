/**
 * Contraste WCAG 2.1, calculado y no recordado.
 *
 * Existe porque §5.6 del sistema de diseño convierte el contraste en una
 * verificación **obligatoria** de la ETAPA 09, y una verificación que se hace
 * mirando la pantalla no es una verificación: es una opinión. La fórmula vive
 * en `packages/config` y no en la consola para que las tres superficies que
 * consumen el preset —consola, consolas operativas y, traducida, Flutter— midan
 * con la misma regla.
 *
 * Funciones puras, sin estado y sin I/O.
 */

const canalLineal = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** Luminancia relativa de un color `#RRGGBB`. */
export const luminancia = (hex: string): number => {
  const limpio = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) {
    throw new Error(`color no válido: «${hex}»; se espera #RRGGBB`);
  }
  const canal = (posicion: number): number =>
    canalLineal(Number.parseInt(limpio.slice(posicion, posicion + 2), 16));
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
};

/** Razón de contraste entre dos colores; siempre ≥ 1, sin importar el orden. */
export const contraste = (a: string, b: string): number => {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
};

/** Umbrales de AA, según §5.6 y WCAG 2.1. */
export const UMBRAL_AA = {
  /** Texto normal: menor de 18,66 px en negrita o de 24 px sin negrita. */
  textoNormal: 4.5,
  textoGrande: 3,
  /** Bordes, iconos y demás componentes de interfaz. */
  componente: 3,
} as const;

export const cumpleAA = (
  primerPlano: string,
  fondo: string,
  umbral: number = UMBRAL_AA.textoNormal,
): boolean => contraste(primerPlano, fondo) >= umbral;

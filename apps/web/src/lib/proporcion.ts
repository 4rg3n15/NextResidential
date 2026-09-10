/**
 * Traduce una proporción a una clase estática de las declaradas en
 * `globals.css`.
 *
 * Existe para que ningún componente vuelva a escribir `style={{ height: … }}`:
 * ese atributo lo rechaza la CSP (§2.7.7) y las barras salen a cero sin que
 * nadie se entere, porque el navegador lo dice en la consola y las pruebas de
 * componentes corren en jsdom, que no aplica CSP.
 *
 * Se acota a [0, 100] antes de redondear: un dato corrupto o un divisor mal
 * calculado produciría `alto-240`, una clase que no existe y una barra sin
 * altura — es decir, el mismo fallo silencioso, por otro camino.
 */
const cuantizar = (porcentaje: number): number => {
  if (!Number.isFinite(porcentaje)) return 0;
  const acotado = Math.min(100, Math.max(0, porcentaje));
  return Math.round(acotado / 2) * 2;
};

export const claseDeAlto = (porcentaje: number): string => `alto-${cuantizar(porcentaje)}`;
export const claseDeAncho = (porcentaje: number): string => `ancho-${cuantizar(porcentaje)}`;

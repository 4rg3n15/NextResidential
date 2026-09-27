/**
 * Saca los objetos JSON completos de un texto acumulado.
 *
 * El flujo llega en trozos que **no** respetan los límites de los bloques: un
 * objeto puede partirse entre dos lecturas. Se cuentan llaves fuera de cadena
 * —con su escape— y se emite sólo lo que está cerrado; el resto se queda para
 * la siguiente vuelta. Contar llaves a secas partiría cualquier objeto que
 * tuviera una `{` dentro de un texto.
 */
export const extraerObjetos = (
  acumulado: string,
): { readonly objetos: readonly string[]; readonly resto: string } => {
  const objetos: string[] = [];
  let profundidad = 0;
  let inicio = -1;
  let enCadena = false;
  let escapado = false;

  for (let i = 0; i < acumulado.length; i += 1) {
    const c = acumulado[i];
    if (enCadena) {
      if (escapado) escapado = false;
      else if (c === '\\') escapado = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === '{') {
      if (profundidad === 0) inicio = i;
      profundidad += 1;
    } else if (c === '}') {
      profundidad -= 1;
      if (profundidad === 0 && inicio !== -1) {
        objetos.push(acumulado.slice(inicio, i + 1));
        inicio = -1;
      }
      // Una llave de cierre de más es ruido del transporte, no un objeto.
      if (profundidad < 0) profundidad = 0;
    }
  }

  const resto = inicio === -1 ? '' : acumulado.slice(inicio);
  return { objetos, resto };
};

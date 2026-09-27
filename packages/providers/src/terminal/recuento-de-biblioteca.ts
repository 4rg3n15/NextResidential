/**
 * Anexo 15-K · el recuento de la biblioteca de rostros tal como lo devuelve
 * `GET FDLib/Count` en las guías de las dos series: `recordDataNumber` dentro de
 * `FDRecordDataInfo`. `FDRecordCount.totalNum` es la forma que se leía antes y
 * se sigue aceptando. `null` si no hay número: no se inventa un cero.
 */
export const recuentoDeLaBiblioteca = (json: string | null): number | null => {
  if (json === null) return null;
  const m = /"recordDataNumber"\s*:\s*(\d+)/.exec(json) ?? /"totalNum"\s*:\s*(\d+)/.exec(json);
  return m?.[1] === undefined ? null : Number(m[1]);
};

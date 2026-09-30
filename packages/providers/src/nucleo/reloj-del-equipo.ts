/**
 * ═════════════════════════════════════════════════════════════════════════════
 * R2 (15-N) · EL RELOJ DEL EQUIPO, LEÍDO Y DICHO EN PALABRAS
 *
 * El 29/09 el videoportero iba 46 727 s (unas 13 h) atrasado con la zona
 * correcta: reconocía la cara y negaba con «permiso vencido», porque la
 * vigencia que se le había escrito todavía no empezaba en SU reloj. Un
 * reloj desviado no produce ningún error: sólo decisiones equivocadas.
 *
 * `/ISAPI/System/time` → `<localTime>` con su desplazamiento (Guía ISAPI
 * integral, §5.4 Device Time Sync). Sin desplazamiento no se compara: se
 * interpretaría en la zona del servidor y el desvío sería inventado.
 * ═════════════════════════════════════════════════════════════════════════════
 */

/** Por omisión, el mismo umbral que `EQUIPOS_DESVIO_DE_RELOJ_S`. */
export const DESVIO_DE_RELOJ_POR_OMISION_S = 30;

const CON_DESPLAZAMIENTO = /(?:Z|[+-]\d{2}:?\d{2})$/;

const etiqueta = (cuerpo: string, nombre: string): string | null =>
  new RegExp(`<${nombre}>\\s*([^<]*?)\\s*</${nombre}>`).exec(cuerpo)?.[1] ?? null;

/**
 * Segundos que el reloj del equipo va POR DELANTE del servidor (negativo:
 * atrasado). `null` si no declaró una hora con desplazamiento utilizable.
 */
export const desvioDelReloj = (cuerpo: string, ahoraDelServidor: Date): number | null => {
  const leida = etiqueta(cuerpo, 'localTime') ?? etiqueta(cuerpo, 'time');
  if (leida === null || !CON_DESPLAZAMIENTO.test(leida)) return null;
  const instante = Date.parse(leida);
  if (Number.isNaN(instante)) return null;
  return Math.round((instante - ahoraDelServidor.getTime()) / 1000);
};

/** «13 h 0 min atrasado», «4 min 10 s adelantado», «45 s atrasado». */
export const desvioEnPalabras = (segundos: number): string => {
  const total = Math.abs(Math.round(segundos));
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const cuanto =
    h > 0
      ? `${String(h)} h ${String(min)} min`
      : min > 0
        ? `${String(min)} min ${String(s)} s`
        : `${String(s)} s`;
  return `${cuanto} ${segundos > 0 ? 'adelantado' : 'atrasado'}`;
};

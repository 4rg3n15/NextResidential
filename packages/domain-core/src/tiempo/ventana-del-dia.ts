/**
 * «Hoy» no es una fecha: es un intervalo, y depende de dónde esté la
 * copropiedad.
 *
 * El tablero muestra «visitantes hoy» (W-02). Calcular esa ventana con la zona
 * del servidor o con la del navegador da resultados distintos para el mismo
 * dato: un conjunto en `America/Bogota` visto desde un servidor en UTC pierde
 * las cinco últimas horas del día y suma cinco del anterior. El esquema ya
 * resolvió de quién es la zona horaria —`copropiedades.zona_horaria`, NOT NULL,
 * validada contra `pg_timezone_names` por la migración 0004—, así que aquí solo
 * queda usarla.
 *
 * Función pura con el instante inyectado (§2.4): no lee el reloj, lo recibe.
 */

export interface VentanaDelDia {
  /** Instante de la medianoche local, inclusive. */
  readonly desde: Date;
  /** Instante de la medianoche local del día siguiente, exclusivo. */
  readonly hasta: Date;
  /** Zona con la que se calculó, para que el consumidor pueda declararla. */
  readonly zonaHoraria: string;
}

interface PartesLocales {
  readonly anio: number;
  readonly mes: number;
  readonly dia: number;
  readonly hora: number;
  readonly minuto: number;
  readonly segundo: number;
}

const FORMATEADOR = new Map<string, Intl.DateTimeFormat>();

/**
 * `Intl` no es I/O: no toca red, disco ni reloj. Se memoiza el formateador
 * porque construirlo es caro y el tablero lo usa por cada fila del histograma.
 */
const formateador = (zonaHoraria: string): Intl.DateTimeFormat => {
  const memo = FORMATEADOR.get(zonaHoraria);
  if (memo !== undefined) return memo;
  const nuevo = new Intl.DateTimeFormat('en-US', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  FORMATEADOR.set(zonaHoraria, nuevo);
  return nuevo;
};

const partesLocales = (instante: Date, zonaHoraria: string): PartesLocales => {
  const partes = formateador(zonaHoraria).formatToParts(instante);
  const leer = (tipo: Intl.DateTimeFormatPartTypes): number => {
    const parte = partes.find((p) => p.type === tipo);
    return parte === undefined ? 0 : Number(parte.value);
  };
  return {
    anio: leer('year'),
    mes: leer('month'),
    dia: leer('day'),
    hora: leer('hour'),
    minuto: leer('minute'),
    segundo: leer('second'),
  };
};

/**
 * Desplazamiento de la zona respecto de UTC en ese instante concreto, en ms.
 * Se calcula por diferencia y no con una tabla: así el horario de verano sale
 * gratis, y Colombia —que no lo tiene— no paga por ello.
 */
const desplazamientoMs = (instante: Date, zonaHoraria: string): number => {
  const p = partesLocales(instante, zonaHoraria);
  const comoSiFueraUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  // Se descartan los milisegundos del instante: `formatToParts` no los da y
  // compararlos sin normalizar introduciría un error de hasta 999 ms.
  return comoSiFueraUtc - Math.floor(instante.getTime() / 1000) * 1000;
};

/**
 * Instante UTC de la medianoche local del día `anio-mes-dia` en `zonaHoraria`.
 *
 * Dos pasadas y no una: la primera estima el desplazamiento con el instante de
 * referencia, que puede caer al otro lado de un cambio de horario de verano; la
 * segunda lo recalcula ya sobre la medianoche estimada. Sin la segunda, un
 * conjunto en una zona con DST vería su día empezar una hora antes o después
 * dos veces al año, y el contador de «visitantes hoy» saldría mal justo esos
 * días — sin ningún síntoma que lo delatara.
 */
const medianocheLocal = (
  anio: number,
  mes: number,
  dia: number,
  zonaHoraria: string,
  referencia: Date,
): Date => {
  const nominal = Date.UTC(anio, mes - 1, dia, 0, 0, 0);
  const primera = new Date(nominal - desplazamientoMs(referencia, zonaHoraria));
  return new Date(nominal - desplazamientoMs(primera, zonaHoraria));
};

/**
 * Ventana `[medianoche, medianoche siguiente)` del día que contiene `ahora`,
 * expresada en instantes absolutos para que la consulta sea comparable con
 * `timestamptz`.
 */
export const ventanaDelDia = (ahora: Date, zonaHoraria: string): VentanaDelDia => {
  const hoy = partesLocales(ahora, zonaHoraria);
  const desde = medianocheLocal(hoy.anio, hoy.mes, hoy.dia, zonaHoraria, ahora);
  // Se avanza sobre el CALENDARIO local y no sumando 24 h al instante: un día
  // con cambio de horario dura 23 o 25 horas, y sumar 86 400 000 ms se comería
  // una hora del día siguiente o dejaría una del propio fuera.
  //
  // El día siguiente se normaliza con `Date.UTC`, que arregla solo el
  // desbordamiento de mes y de año, y se leen sus partes con `getUTC*`. La
  // primera versión volvía a pasar por `partesLocales` sobre un mediodía UTC, y
  // en `Pacific/Chatham` (UTC+12:45) ese mediodía cae ya en el día siguiente
  // local: la ventana salía de 48 horas. Lo encontró la prueba, no la revisión.
  const siguiente = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + 1));
  const hasta = medianocheLocal(
    siguiente.getUTCFullYear(),
    siguiente.getUTCMonth() + 1,
    siguiente.getUTCDate(),
    zonaHoraria,
    new Date(desde.getTime() + 86_400_000),
  );
  return { desde, hasta, zonaHoraria };
};

/** Hora local (0–23) del instante, para agrupar el histograma de accesos. */
export const horaLocal = (instante: Date, zonaHoraria: string): number =>
  partesLocales(instante, zonaHoraria).hora;

/**
 * Una zona horaria inválida haría que `Intl` lance en mitad de una consulta y
 * el tablero devolviera 500 sin explicar por qué. Se valida antes de usarla,
 * igual que hace el CHECK `app.es_zona_horaria` de la migración 0004.
 */
export const esZonaHorariaValida = (zonaHoraria: string): boolean => {
  try {
    formateador(zonaHoraria);
    return true;
  } catch {
    return false;
  }
};

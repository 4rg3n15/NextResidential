/**
 * Fechas de la consola, en el formato que el cliente pidió leer: `DD-MM-YYYY`,
 * y los rangos con la fecha en los DOS extremos aunque caigan el mismo día.
 * Una vigencia «14:00 – 16:00» sin fecha obliga a suponer que es hoy, y una
 * autorización programada para mañana se lee igual que una de hoy.
 *
 * Todo se calcula en la hora local del navegador: es la hora en la que la
 * persona está mirando la pantalla, que es la única que le sirve.
 */
const dos = (n: number): string => String(n).padStart(2, '0');

const aFecha = (valor: string | Date): Date | null => {
  const d = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** `DD-MM-YYYY`, o «—» si el valor no es una fecha. */
export const fechaCorta = (valor: string | Date): string => {
  const d = aFecha(valor);
  if (d === null) return '—';
  return `${dos(d.getDate())}-${dos(d.getMonth() + 1)}-${String(d.getFullYear())}`;
};

/** `HH:MM` en hora local. */
export const horaCorta = (valor: string | Date): string => {
  const d = aFecha(valor);
  return d === null ? '—' : `${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

/** `DD-MM-YYYY HH:MM`. */
export const fechaYHora = (valor: string | Date): string => {
  const d = aFecha(valor);
  return d === null ? '—' : `${fechaCorta(d)} ${horaCorta(d)}`;
};

/** `DD-MM-YYYY HH:MM – DD-MM-YYYY HH:MM`: la fecha va en los dos extremos, siempre. */
export const rangoConFechas = (desde: string | Date, hasta: string | Date): string =>
  `${fechaYHora(desde)} – ${fechaYHora(hasta)}`;

/**
 * Hoy y la hora actual en hora local, en el formato que aceptan los campos
 * `date` y `time` del navegador, para precargar un formulario.
 */
export const ahoraLocal = (ahora: Date = new Date()): { fecha: string; hora: string } => ({
  fecha: `${String(ahora.getFullYear())}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}`,
  hora: `${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`,
});

/**
 * C5 (15-M) · el rango de una VISITA como lo pidió el cliente para la consola:
 * «28-09-2026 06:56 p. m. a 29-09-2026 06:56 a. m.». La fecha va en los dos
 * extremos —«06:56 p. m. a 06:56 a. m.» sin día es lo que hizo leer una visita
 * de 24 horas como una de 0 minutos— y la hora, en el reloj de 12 horas con
 * el que se escriben los horarios en Colombia.
 */
const horaDoce = (d: Date): string => {
  const partes = new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const de = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  const periodo = de('dayPeriod').replace(/\s+/g, '').replace(/\./g, '').toLowerCase();
  const marca = periodo.startsWith('p') ? 'p. m.' : 'a. m.';
  return `${de('hour').padStart(2, '0')}:${de('minute')} ${marca}`;
};

export const rangoDeVisita = (desde: string | Date, hasta: string | Date): string => {
  const a = aFecha(desde);
  const b = aFecha(hasta);
  if (a === null || b === null) return '—';
  return `${fechaCorta(a)} ${horaDoce(a)} a ${fechaCorta(b)} ${horaDoce(b)}`;
};

/**
 * Otros fallos (15-M) · el día de hace `dias` días, en la fecha LOCAL del
 * navegador (`YYYY-MM-DD` para un `<input type="date">`). Con `toISOString`
 * salía la fecha UTC: en Colombia, desde las 19:00, «hasta hoy» proponía mañana.
 */
export const diaLocalHace = (dias: number, ahora: Date = new Date()): string =>
  ahoraLocal(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dias, 12)).fecha;

/**
 * Otros fallos (15-M) · el rango de días de un filtro, con el fin EXCLUSIVO
 * del dominio (el día siguiente a `hasta`, a las 00:00 locales). `null` si un
 * extremo está vacío o no es una fecha, o si `desde` va después de `hasta`:
 * antes, vaciar un campo lanzaba `RangeError` y tumbaba la página entera.
 */
export const rangoDeDias = (
  desde: string,
  hasta: string,
): { readonly desde: string; readonly hasta: string } | null => {
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/;
  const a = dia.exec(desde);
  const b = dia.exec(hasta);
  if (a === null || b === null) return null;
  const inicio = new Date(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const fin = new Date(Number(b[1]), Number(b[2]) - 1, Number(b[3]) + 1);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || inicio >= fin) return null;
  return { desde: inicio.toISOString(), hasta: fin.toISOString() };
};

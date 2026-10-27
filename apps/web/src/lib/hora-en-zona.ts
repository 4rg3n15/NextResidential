/**
 * D-145 · la hora de una ZONA HORARIA concreta, no la del navegador.
 *
 * `lib/fechas` calcula en la hora del navegador, que es la de quien mira. El
 * buscador de eventos y el corte diario de la portería no pueden: «hoy» es el
 * día de la copropiedad (America/Bogota), y un portátil con la zona mal puesta
 * no puede cambiar qué eventos ve el portero ni qué pide un filtro.
 *
 * Se resuelve con `Intl` —sin dependencias— y sin suponer el desfase: Colombia
 * no tiene horario de verano, pero la función no lo sabe ni le hace falta.
 */
export const ZONA_DE_LA_CONSOLA = 'America/Bogota';

const dos = (n: number): string => String(n).padStart(2, '0');

interface Partes {
  readonly anio: number;
  readonly mes: number;
  readonly dia: number;
  readonly hora: number;
  readonly minuto: number;
  readonly segundo: number;
}

const formateadores = new Map<string, Intl.DateTimeFormat>();
const formateadorDe = (zona: string): Intl.DateTimeFormat => {
  const ya = formateadores.get(zona);
  if (ya !== undefined) return ya;
  const nuevo = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  formateadores.set(zona, nuevo);
  return nuevo;
};

const partesEnZona = (d: Date, zona: string): Partes => {
  const p = formateadorDe(zona).formatToParts(d);
  const n = (tipo: Intl.DateTimeFormatPartTypes): number =>
    Number(p.find((x) => x.type === tipo)?.value ?? '0');
  return {
    anio: n('year'),
    mes: n('month'),
    dia: n('day'),
    hora: n('hour'),
    minuto: n('minute'),
    segundo: n('second'),
  };
};

/** Cuánto va la zona por delante de UTC en ese instante, en milisegundos. */
const desfaseMs = (d: Date, zona: string): number => {
  const p = partesEnZona(d, zona);
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - Math.floor(d.getTime() / 1000) * 1000;
};

/** `YYYY-MM-DDTHH:MM` en la zona: lo que acepta un `<input type="datetime-local">`. */
export const localEnZona = (d: Date, zona: string = ZONA_DE_LA_CONSOLA): string => {
  const p = partesEnZona(d, zona);
  return `${String(p.anio)}-${dos(p.mes)}-${dos(p.dia)}T${dos(p.hora)}:${dos(p.minuto)}`;
};

/**
 * El instante que corresponde a una hora de pared de la zona
 * (`YYYY-MM-DDTHH:MM`), o `null` si el texto no es una fecha y hora.
 */
export const instanteDeLocal = (local: string, zona: string = ZONA_DE_LA_CONSOLA): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (m === null) return null;
  const [anio, mes, dia, hora, minuto] = m.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || hora > 23 || minuto > 59) return null;
  const pared = Date.UTC(anio, mes - 1, dia, hora, minuto);
  // Dos pasadas: la segunda corrige si el desfase cambia entre la suposición y el resultado.
  const primera = pared - desfaseMs(new Date(pared), zona);
  return new Date(pared - desfaseMs(new Date(primera), zona));
};

/** Las 00:00 del día que es HOY en la zona, como instante. */
export const inicioDelDiaEnZona = (d: Date, zona: string = ZONA_DE_LA_CONSOLA): Date => {
  const p = partesEnZona(d, zona);
  return instanteDeLocal(`${String(p.anio)}-${dos(p.mes)}-${dos(p.dia)}T00:00`, zona) ?? d;
};

/** Las 00:00 del día SIGUIENTE en la zona: el fin exclusivo de «hoy». */
export const finDelDiaEnZona = (d: Date, zona: string = ZONA_DE_LA_CONSOLA): Date =>
  inicioDelDiaEnZona(new Date(inicioDelDiaEnZona(d, zona).getTime() + 36 * 3_600_000), zona);

/** `DD-MM-YYYY HH:MM:SS` en la zona, el formato de fecha que pidió el cliente. */
export const fechaYHoraEnZona = (
  valor: string | Date,
  zona: string = ZONA_DE_LA_CONSOLA,
): string => {
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  const p = partesEnZona(d, zona);
  return `${dos(p.dia)}-${dos(p.mes)}-${String(p.anio)} ${dos(p.hora)}:${dos(p.minuto)}:${dos(p.segundo)}`;
};

/** `HH:MM` en la zona. */
export const horaEnZona = (valor: Date, zona: string = ZONA_DE_LA_CONSOLA): string => {
  const p = partesEnZona(valor, zona);
  return `${dos(p.hora)}:${dos(p.minuto)}`;
};

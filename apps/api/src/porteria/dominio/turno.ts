/**
 * EL TURNO DEL PORTERO · la cuenta de su franja (ADR-024).
 *
 * Un turno es portero + día + hora de inicio y de fin **en la zona horaria de
 * la copropiedad**. Si la hora de fin no es posterior a la de inicio, el turno
 * cruza la medianoche y termina al día siguiente. La franja es semiabierta
 * `[inicio, fin)`: a la hora exacta de fin el turno ya no está vigente.
 *
 * La base calcula lo mismo en `app.tg_franja_de_turno` (0037) y una prueba
 * contra base exige que coincidan. Esta versión existe porque el doble en
 * memoria y el propio caso de uso necesitan la franja sin preguntar a la base.
 *
 * Puro: sin reloj propio. El instante se recibe siempre de fuera.
 */
export interface Franja {
  readonly inicio: Date;
  readonly fin: Date;
}

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const esDia = (v: string): boolean => {
  const m = DIA.exec(v);
  if (m === null) return false;
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const f = new Date(Date.UTC(a, mes - 1, d));
  return f.getUTCFullYear() === a && f.getUTCMonth() === mes - 1 && f.getUTCDate() === d;
};
export const esHora = (v: string): boolean => HORA.test(v);

export const cruzaMedianoche = (horaInicio: string, horaFin: string): boolean =>
  horaFin <= horaInicio;

/** Minutos que la zona está por delante de UTC en ese instante. */
const desfaseMinutos = (instanteMs: number, zona: string): number => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instanteMs));
  const v = (t: string): number => Number(partes.find((p) => p.type === t)?.value ?? '0');
  const comoUtc = Date.UTC(
    v('year'),
    v('month') - 1,
    v('day'),
    v('hour'),
    v('minute'),
    v('second'),
  );
  return Math.round((comoUtc - instanteMs) / 60_000);
};

/** El instante UTC de una fecha y hora de reloj en la zona dada. */
export const instanteLocal = (dia: string, hora: string, zona: string, masDias = 0): Date => {
  const [a, mes, d] = dia.split('-').map(Number) as [number, number, number];
  const [h, mi] = hora.split(':').map(Number) as [number, number];
  const comoUtc = Date.UTC(a, mes - 1, d + masDias, h, mi);
  // Dos pasadas: la primera estima con el desfase de la hora UTC; la segunda
  // corrige si ese instante cae al otro lado de un cambio de horario.
  const primera = comoUtc - desfaseMinutos(comoUtc, zona) * 60_000;
  return new Date(comoUtc - desfaseMinutos(primera, zona) * 60_000);
};

export const franjaDe = (
  dia: string,
  horaInicio: string,
  horaFin: string,
  zona: string,
): Franja => ({
  inicio: instanteLocal(dia, horaInicio, zona),
  fin: instanteLocal(dia, horaFin, zona, cruzaMedianoche(horaInicio, horaFin) ? 1 : 0),
});

export const contiene = (f: Franja, instante: Date): boolean =>
  f.inicio.getTime() <= instante.getTime() && instante.getTime() < f.fin.getTime();

export const seSolapan = (a: Franja, b: Franja): boolean =>
  a.inicio.getTime() < b.fin.getTime() && b.inicio.getTime() < a.fin.getTime();

export const duracionSegundos = (desde: Date, hasta: Date): number =>
  Math.max(0, Math.round((hasta.getTime() - desde.getTime()) / 1000));

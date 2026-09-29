/**
 * C9 (15-M) · LA CONFIRMACIÓN DE LA PLACA, EN UNA FRASE.
 *
 * Cuando una visita lleva placa, quien la generó necesita leer —en la consola,
 * en la app y en el detalle— exactamente qué quedó registrado y para cuándo:
 *
 *   «Placa ABC123 registrada para la visita de Ana Pérez,
 *    del 28-09-2026 18:56 al 29-09-2026 06:56»
 *
 * Es una función PURA: recibe fechas y devuelve texto, y por eso la misma
 * frase sale por las tres superficies sin que ninguna la redacte por su cuenta.
 * La fecha va en los DOS extremos (C5): «de 18:56 a 06:56» sin día es lo que
 * hizo leer una visita de 24 horas como una de 0 minutos.
 *
 * [SUPUESTO] S-131 · la hora se escribe en la zona de la copropiedad, que hoy
 * es una sola (`America/Bogota`); el parámetro existe para cuando haya más.
 */
export const ZONA_HORARIA_DE_LA_CONFIRMACION = 'America/Bogota';

export interface DatosDeConfirmacion {
  readonly placa: string | null;
  readonly visitante: string;
  readonly desde: Date;
  readonly hasta: Date;
  readonly zonaHoraria?: string;
}

/** `DD-MM-YYYY HH:MM`, con reloj de 24 horas y en la zona indicada. */
export const momentoCorto = (
  fecha: Date,
  zonaHoraria: string = ZONA_HORARIA_DE_LA_CONFIRMACION,
): string => {
  const partes = new Intl.DateTimeFormat('es-CO', {
    timeZone: zonaHoraria,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const de = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return `${de('day')}-${de('month')}-${de('year')} ${de('hour')}:${de('minute')}`;
};

/** `null` cuando la visita no lleva placa: no hay nada que confirmar. */
export const confirmacionDePlaca = (d: DatosDeConfirmacion): string | null => {
  const placa = d.placa?.trim() ?? '';
  if (placa === '') return null;
  const visitante = d.visitante.trim() === '' ? 'el visitante' : d.visitante.trim();
  return (
    `Placa ${placa} registrada para la visita de ${visitante}, ` +
    `del ${momentoCorto(d.desde, d.zonaHoraria)} al ${momentoCorto(d.hasta, d.zonaHoraria)}`
  );
};

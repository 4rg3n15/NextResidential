/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EDAD Y MAYORÍA DE EDAD · RONDA 15-W (D-W2, S-15W-02, S-15W-06)
 *
 * Sólo los mayores de 18 años tienen cuenta (D-W2); los menores son personas y
 * residentes SIN cuenta, que registra un adulto de su hogar (ADR-038). La regla
 * vive AQUÍ, con el reloj inyectado (§2.4), y la base la repite como segunda
 * barrera (`app.es_menor_de_edad`, migración 0055) con la MISMA aritmética:
 *
 *  · el día que cuenta es el de BOGOTÁ, no el de UTC: a las 20:00 del día
 *    anterior al cumpleaños, en Bogotá, en UTC ya es el cumpleaños, y una cuenta
 *    abierta a esa hora sería la de un menor;
 *  · quien nació un 29 de febrero cumple, en los años no bisiestos, el 1 de
 *    marzo (S-15W-06): es lo que da restar el intervalo en PostgreSQL, y el
 *    dominio no puede decir otra cosa que la base.
 *
 * Colombia no cambia la hora, pero el día se le pide al calendario de la zona y
 * no a un desfase fijo: si algún día cambiara, cambiaría en los dos lados.
 * ═════════════════════════════════════════════════════════════════════════════
 */

export const MAYORIA_DE_EDAD = 18;
export const ZONA_DE_LA_EDAD = 'America/Bogota';

/** D-W2 · lo que lee quien intenta abrir una cuenta siendo menor. */
export const MENSAJE_CUENTA_DE_MENOR =
  'Las cuentas son para mayores de edad. Un adulto de su hogar lo registra desde Mi familia';
/** D4 · lo que lee el adulto que intenta registrar como menor a un mayor de edad. */
export const MENSAJE_MAYOR_SIN_CUENTA =
  'Una persona mayor de edad crea su propia cuenta con un código de plaza';

const CALENDARIO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_DE_LA_EDAD,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** El día civil de Bogotá en ese instante, como `AAAA-MM-DD`. */
export const diaCivilEnBogota = (ahora: Date): string => {
  const partes = CALENDARIO.formatToParts(ahora);
  const de = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${de('year')}-${de('month')}-${de('day')}`;
};

/** `AAAA-MM-DD` que existe en el calendario y no es anterior a 1900 (como la 0038). */
export const esFechaCivil = (valor: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor < '1900-01-01') return false;
  const fecha = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor;
};

const numeros = (fecha: string): readonly [number, number, number] => {
  const [a, m, d] = fecha.split('-').map(Number);
  return [a ?? 0, m ?? 0, d ?? 0];
};

/**
 * Años cumplidos en el día de Bogotá de `ahora`. `null` si la fecha no es una
 * fecha civil o es posterior a hoy: no hay edad que calcular, y quien llama lo
 * trata como un dato inválido, nunca como «mayor».
 */
export const edadEn = (fechaNacimiento: string, ahora: Date): number | null => {
  if (!esFechaCivil(fechaNacimiento)) return null;
  const hoy = diaCivilEnBogota(ahora);
  if (fechaNacimiento > hoy) return null;
  const [anio, mes, dia] = numeros(fechaNacimiento);
  const [anioHoy, mesHoy, diaHoy] = numeros(hoy);
  const yaCumplio = mesHoy > mes || (mesHoy === mes && diaHoy >= dia);
  return anioHoy - anio - (yaCumplio ? 0 : 1);
};

/** D-W2 · `edad >= 18`. */
export const puedeTenerCuenta = (edad: number): boolean => edad >= MAYORIA_DE_EDAD;

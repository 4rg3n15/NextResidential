/**
 * 15-Y1 · la edad para «Crear cuenta» y el primer ingreso, como la app
 * (`apps/mobile/lib/dominio/edad.dart`) y el dominio (`residente/edad.ts`):
 * sólo los mayores de 18 tienen cuenta (D-W2), el día es el civil de Bogotá y
 * se juzga con UN DÍA de margen a favor de quien escribe, porque el servidor
 * decide después con su reloj. La consola no depende de `@ncr/domain-core` —
 * sólo del contrato—, así que estas reglas se repiten aquí con sus pruebas.
 */
export const MAYORIA_DE_EDAD = 18;
export const ZONA_DE_LA_EDAD = 'America/Bogota';
const MARGEN_MS = 24 * 60 * 60_000;

export const MENSAJE_CUENTA_DE_MENOR =
  'Las cuentas son para mayores de edad. Un adulto de su hogar lo registra desde Mi familia';

const CALENDARIO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_DE_LA_EDAD,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const diaCivilEnBogota = (ahora: Date): string => {
  const partes = CALENDARIO.formatToParts(ahora);
  const de = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${de('year')}-${de('month')}-${de('day')}`;
};

const numeros = (fecha: string): readonly [number, number, number] => {
  const [a, m, d] = fecha.split('-');
  return [Number(a), Number(m), Number(d)];
};

/** `AAAA-MM-DD` que existe en el calendario y no es anterior a 1900. */
export const esFechaCivil = (valor: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor < '1900-01-01') return false;
  const [anio, mes, dia] = numeros(valor);
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  return f.getUTCFullYear() === anio && f.getUTCMonth() === mes - 1 && f.getUTCDate() === dia;
};

/** Años cumplidos en el día de Bogotá; `null` si no es fecha civil o es futura. */
export const edadEn = (fechaNacimiento: string, ahora: Date): number | null => {
  if (!esFechaCivil(fechaNacimiento)) return null;
  const hoy = diaCivilEnBogota(ahora);
  if (fechaNacimiento > hoy) return null;
  const [anio, mes, dia] = numeros(fechaNacimiento);
  const [anioHoy, mesHoy, diaHoy] = numeros(hoy);
  const yaCumplio = mesHoy > mes || (mesHoy === mes && diaHoy >= dia);
  return anioHoy - anio - (yaCumplio ? 0 : 1);
};

export const puedeTenerCuenta = (edad: number): boolean => edad >= MAYORIA_DE_EDAD;

const motivoDeForma = (fecha: string, vacia: string): string | null => {
  if (fecha === '') return vacia;
  if (!esFechaCivil(fecha)) return 'Escriba la fecha como AAAA-MM-DD';
  return null;
};

/** Cortesía de «Crear cuenta» y del primer ingreso. `null` si puede viajar. */
export const motivoDeFechaDeAdulto = (bruto: string, ahora: Date): string | null => {
  const fecha = bruto.trim();
  const forma = motivoDeForma(fecha, 'Escriba su fecha de nacimiento');
  if (forma !== null) return forma;
  const edad = edadEn(fecha, new Date(ahora.getTime() + MARGEN_MS));
  if (edad === null) return 'Esa fecha todavía no llegó';
  return puedeTenerCuenta(edad) ? null : MENSAJE_CUENTA_DE_MENOR;
};

export const MENSAJE_MAYOR_SIN_CUENTA =
  'Una persona mayor de edad crea su propia cuenta con un código de plaza';

/**
 * 15-Y2 · cortesía de «Añadir menor» y «Editar menor», como la app
 * (`motivoDeFechaDeMenor` en Dart): la fecha existe, no es futura y, con el
 * mismo día de margen pero a favor del MENOR, quien ya cumplió 18 no se
 * registra aquí. `null` si puede viajar; el servidor decide después.
 */
export const motivoDeFechaDeMenor = (bruto: string, ahora: Date): string | null => {
  const fecha = bruto.trim();
  const forma = motivoDeForma(fecha, 'Escriba la fecha de nacimiento');
  if (forma !== null) return forma;
  if (edadEn(fecha, new Date(ahora.getTime() + MARGEN_MS)) === null) {
    return 'Esa fecha todavía no llegó';
  }
  // Nacido hoy con el reloj adelantado: aún no tiene edad, y es un menor.
  const edad = edadEn(fecha, new Date(ahora.getTime() - MARGEN_MS)) ?? 0;
  return puedeTenerCuenta(edad) ? MENSAJE_MAYOR_SIN_CUENTA : null;
};

import type { FranjaDeZona } from '@ncr/contracts';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

const enHora = (minutos: number): string => {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Horario legible, **incluida la franja que cruza la medianoche**.
 *
 * Es el detalle que el requisito señala y que una interfaz ingenua pierde: una
 * zona abierta de 22:00 a 02:00 se guarda como dos franjas encadenadas, y la
 * segunda lleva `continuaDelDiaAnterior`. Si se pintaran como dos horarios
 * independientes —«sábado 22:00–24:00» y «domingo 00:00–02:00»— el operador
 * leería que la zona cierra a medianoche, y **el contador de aforo no se
 * reinicia ahí**: la gente que entró el sábado sigue dentro el domingo. Aquí se
 * escribe como lo que es: una continuación.
 */
export const franjaEnTexto = (franja: FranjaDeZona): string => {
  const dia = DIAS[franja.dia] ?? '¿?';
  const rango = `${enHora(franja.minutoInicio)}–${enHora(franja.minutoFin)}`;
  return franja.continuaDelDiaAnterior
    ? `${dia} ${rango} (viene del día anterior; el aforo no se reinicia)`
    : `${dia} ${rango}`;
};

import type { PatronDeAutorizacion } from '@ncr/contracts';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

/**
 * El patrón de recurrencia, en texto legible.
 *
 * **El mockup pide que el patrón sea visible**, y una autorización recurrente
 * cuyo patrón no se ve es indistinguible de una que abre siempre: son la misma
 * tarjeta con la misma vigencia. Sin esta línea, quien revisa no puede saber si
 * el contratista entra los martes o todos los días.
 *
 * Los días llegan 0..6 con domingo = 0, que es el vocabulario del dominio; la
 * conversión a ISO vive en el adaptador de persistencia y no aquí.
 */
export const patronEnTexto = (patron: PatronDeAutorizacion): string => {
  const dias = [...patron.dias]
    .sort((a, b) => a - b)
    .map((d) => DIAS[d] ?? '?')
    .join(', ');
  return `${dias} · ${patron.horaInicio}–${patron.horaFin}`;
};

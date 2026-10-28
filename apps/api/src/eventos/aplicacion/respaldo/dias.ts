import { fechaLocal, ventanaDelDia } from '@ncr/domain-core';

/**
 * D-147 · QUÉ DÍAS RESPALDAR, EN HORA DE LA COPROPIEDAD
 *
 * El trabajo corre a las 00:15 de Bogotá y trata el día ANTERIOR. Sus límites
 * son las 00:00 y las 24:00 de Bogotá, no de UTC: con UTC, el respaldo del 25
 * llevaría las cinco últimas horas del 24 y perdería las cinco últimas del 25.
 *
 * Si el servidor estuvo apagado, se recuperan los días que falten, hasta 31
 * hacia atrás. Funciones puras, con el instante inyectado (§2.4).
 */
export const ZONA_DEL_RESPALDO = 'America/Bogota';
export const DIAS_DE_RECUPERACION = 31;

export interface DiaDelRespaldo {
  /** `AAAA-MM-DD` en la zona. */
  readonly fecha: string;
  /** 00:00 de ese día en la zona, inclusive. */
  readonly desde: Date;
  /** 00:00 del día siguiente en la zona, exclusivo. */
  readonly hasta: Date;
}

/**
 * Los `dias` días anteriores a hoy (hoy no: aún no ha terminado), del más
 * ANTIGUO al más reciente. Se camina hacia atrás desde la medianoche de hoy:
 * así un día con cambio de hora mide lo que mide, no 24 h supuestas.
 */
export const diasAnteriores = (
  ahora: Date,
  dias: number = DIAS_DE_RECUPERACION,
  zona: string = ZONA_DEL_RESPALDO,
): readonly DiaDelRespaldo[] => {
  const resultado: DiaDelRespaldo[] = [];
  let hasta = ventanaDelDia(ahora, zona).desde;
  for (let i = 0; i < dias; i += 1) {
    const ventana = ventanaDelDia(new Date(hasta.getTime() - 1), zona);
    resultado.push({ fecha: fechaLocal(ventana.desde, zona), desde: ventana.desde, hasta });
    hasta = ventana.desde;
  }
  return resultado.reverse();
};

/** Los que aún no tienen respaldo, del más antiguo al más reciente. */
export const diasSinRespaldo = (
  ahora: Date,
  yaRespaldados: ReadonlySet<string>,
  dias: number = DIAS_DE_RECUPERACION,
  zona: string = ZONA_DEL_RESPALDO,
): readonly DiaDelRespaldo[] =>
  diasAnteriores(ahora, dias, zona).filter((d) => !yaRespaldados.has(d.fecha));

/** `<copropiedadId>/<AAAA>/<MM>/eventos-<AAAA-MM-DD>.xls`, la forma que exige la 0061. */
export const rutaDelRespaldo = (copropiedadId: string, fecha: string): string =>
  `${copropiedadId}/${fecha.slice(0, 4)}/${fecha.slice(5, 7)}/eventos-${fecha}.xls`;

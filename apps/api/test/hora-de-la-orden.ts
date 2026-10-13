import type { Pool } from 'pg';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-S5 · DT-15M-C01 · LA HORA DE UNA ORDEN MANUAL QUE LA PRUEBA BUSCA DESPUÉS
 *
 * La consola lista «las últimas N» órdenes de la copropiedad por `momento`, y
 * `ordenes_manuales` es de sólo inserción: lo que una corrida deja con fecha
 * futura se queda para siempre por encima. `salidas-del-videoportero-pg`
 * fechaba la suya en 2099 para verse entre sus 200, y con eso sacaba de «las
 * últimas 20» de COP_A la de `ensayo-en-sitio-pg` (interferencia
 * `ordenes-futuras`).
 *
 * La hora real, salvo que la copropiedad YA tenga órdenes posteriores: entonces
 * un milisegundo después de la última. En una base limpia nadie escribe en el
 * futuro; en una ensuciada, la de la corrida sigue siendo la más reciente.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const horaDeLaOrden = async (superusuario: Pool, copropiedadId: string): Promise<Date> => {
  const { rows } = await superusuario.query<{ ultima: Date | null }>(
    'SELECT max(momento) AS ultima FROM public.ordenes_manuales WHERE copropiedad_id = $1',
    [copropiedadId],
  );
  return new Date(Math.max(Date.now(), (rows[0]?.ultima?.getTime() ?? 0) + 1));
};

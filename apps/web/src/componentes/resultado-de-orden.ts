import type { TonoDeDistintivo } from '@/componentes/ui/distintivo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-13 · LO QUE EL EQUIPO CONTESTÓ A UNA ORDEN, SIN ADORNO
 *
 * En sitio, la terminal y el videoportero contestaron «OK» a la orden de abrir
 * y la puerta no se movió, mientras el historial de la consola decía
 * «Abierta». La API ya separaba `aceptada` / `rechazada` / `inalcanzable`
 * —ninguno dice «abierta»: sin señal de posición cableada nadie puede
 * afirmarlo (H-1, H-2)— y la consola lo tiraba. Esto es lo único que la
 * consola puede decir de una orden, en un solo sitio para las dos pantallas.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface OrdenConResultado {
  readonly accion: string;
  readonly resultado?: string | null;
  readonly detalle?: string | null;
}

export const resultadoDeOrden = (
  o: OrdenConResultado,
): { readonly tono: TonoDeDistintivo; readonly texto: string } => {
  if (o.accion !== 'abrir') return { tono: 'peligro', texto: 'Negada' };
  switch (o.resultado) {
    case 'aceptada':
      return { tono: 'aviso', texto: 'Aceptada por el equipo · sin confirmación de apertura' };
    case 'rechazada':
      return { tono: 'peligro', texto: 'Rechazada por el equipo' };
    case 'inalcanzable':
      return { tono: 'peligro', texto: 'Equipo inalcanzable' };
    default:
      return { tono: 'neutro', texto: 'Sin respuesta del equipo' };
  }
};

import type { Visita } from '@ncr/contracts';

/**
 * F2 (15-L) · lo que el canal en vivo lleva cuando se genera o se anula una
 * visita (tema `visitas`). Se comprueba la forma antes de pintarla: lo que
 * llega por el canal es texto de la red, no un tipo del compilador.
 */
export interface AvisoDeVisitaEnVivo {
  readonly tipo: 'nueva' | 'anulada';
  readonly visita: Visita;
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export const esAvisoDeVisita = (v: unknown): v is AvisoDeVisitaEnVivo => {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  if (a['tipo'] !== 'nueva' && a['tipo'] !== 'anulada') return false;
  const visita = a['visita'];
  if (typeof visita !== 'object' || visita === null) return false;
  const x = visita as Record<string, unknown>;
  return (
    esTexto(x['autorizacionId']) &&
    esTexto(x['visitante']) &&
    esTexto(x['vivienda']) &&
    esTexto(x['desde']) &&
    esTexto(x['hasta']) &&
    esTexto(x['estado'])
  );
};

/**
 * A4 (15-E) · lo que la API publica por SSE en el tema `llamadas` cuando un
 * videoportero llama. No es un evento de acceso: es un aviso emergente
 * (RN-18, KPI-25) con la vivienda resuelta si el equipo declaró la unidad.
 */
export interface LlamadaEntrante {
  readonly dispositivoId: string;
  readonly clase: 'llamada' | 'timbre';
  readonly viviendaId: string | null;
  /** Identificador legible («Casa 12») o la unidad tal como la dijo el equipo. */
  readonly vivienda: string | null;
  readonly origen: string | null;
  readonly ocurridoEn: string;
  readonly referenciaExterna: string | null;
}

const esCadenaONulo = (v: unknown): v is string | null => v === null || typeof v === 'string';

/** Lo que llega por la red se comprueba antes de pintarlo. */
export const esLlamadaEntrante = (valor: unknown): valor is LlamadaEntrante => {
  if (typeof valor !== 'object' || valor === null) return false;
  const l = valor as Record<string, unknown>;
  return (
    typeof l['dispositivoId'] === 'string' &&
    (l['clase'] === 'llamada' || l['clase'] === 'timbre') &&
    esCadenaONulo(l['viviendaId']) &&
    esCadenaONulo(l['vivienda']) &&
    esCadenaONulo(l['origen']) &&
    typeof l['ocurridoEn'] === 'string' &&
    esCadenaONulo(l['referenciaExterna'])
  );
};

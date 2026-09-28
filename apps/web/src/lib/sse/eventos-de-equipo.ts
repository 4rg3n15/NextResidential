/**
 * 15-L (Bloque B) · lo que el canal de tiempo real lleva de un evento de
 * equipo (tema `eventos-de-equipo`). Se comprueba la forma antes de pintarlo:
 * lo que llega por el canal es texto de la red, no un tipo del compilador.
 */
export interface EventoDeEquipoEnVivo {
  readonly id: string;
  readonly dispositivoId: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly origen: 'equipo' | 'plataforma';
  readonly enVivo: boolean;
  readonly ocurridoEn: string;
  readonly eventoId: string | null;
  readonly codigo: { readonly mayor: number; readonly menor: number } | null;
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export const esEventoDeEquipoEnVivo = (v: unknown): v is EventoDeEquipoEnVivo => {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    esTexto(e['id']) &&
    esTexto(e['dispositivoId']) &&
    esTexto(e['tipo']) &&
    esTexto(e['titulo']) &&
    (e['origen'] === 'equipo' || e['origen'] === 'plataforma') &&
    typeof e['enVivo'] === 'boolean' &&
    esTexto(e['ocurridoEn'])
  );
};

import { disparadorDeEventoDeEquipo } from '../../eventos';
import type { AlertaDeEquipoNueva } from '../../eventos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * G2 (15-N) · LA ALERTA DE LO QUE UN EQUIPO EMITE Y NECESITA A UNA PERSONA
 *
 * Cada disparador de la cola (P-22) abre UNA alerta, deduplicada por equipo,
 * tipo y ventana (`ALERTAS_VENTANA_DEDUP_S`): la llamada del videoportero, el
 * rostro que el equipo no reconoció o negó, la lista negra del propio equipo.
 * La lista negra no se deduplica nunca (S-124). La alerta es el aviso —con su
 * escalamiento—; lo que la consola atiende es el elemento de la cola.
 *
 * Sin tocar el dominio: los tipos de alerta son los de siempre y el disparador
 * viaja como CLAVE (`[llamada] …`), que es lo que la deduplicación distingue.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface EventoParaAlertar {
  readonly dispositivoId: string;
  readonly tipo: string;
  readonly titulo: string;
  readonly enVivo: boolean;
}

export const alertaDeAtencionDeEquipo = (
  evento: EventoParaAlertar,
  copropiedadId: string,
): AlertaDeEquipoNueva | null => {
  const disparador = disparadorDeEventoDeEquipo({
    tipo: evento.tipo,
    enVivo: evento.enVivo,
    origen: 'equipo',
    eventoId: null,
  });
  if (disparador === null) return null;
  const base = {
    copropiedadId,
    dispositivoId: evento.dispositivoId,
    clave: disparador,
    notas: evento.titulo,
    persistente: false,
  } as const;
  if (disparador === 'lista_negra') {
    return { ...base, tipo: 'lista_negra', severidad: 'critica' };
  }
  return { ...base, tipo: 'acceso_dudoso', severidad: disparador === 'llamada' ? 'alta' : 'media' };
};

import { construirClaveIdempotencia } from '@ncr/domain-core';
import type { GeneradorDeId } from '@ncr/domain-core';
import type { EventoDeEquipo } from '@ncr/providers';
import type { EventoDeEquipoNuevo } from '../../eventos';
import { ACTOR_INGESTA } from '../../comun/actores-de-servicio';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UN EVENTO DEL EQUIPO → UNA FILA DE `eventos_de_equipo` · 15-L (Bloque B)
 *
 * La clave de idempotencia es la del dominio (copropiedad, equipo, origen,
 * referencia), con la referencia que el EQUIPO dio a su evento (R2: serie,
 * hora del equipo, uid). Así un reenvío no crea una segunda fila (B3). Si el
 * equipo no dio NADA que identifique el evento, la referencia es única por
 * recepción: no se puede deduplicar lo que no se puede reconocer, y perderlo
 * por parecerse a otro sería peor.
 *
 * Lo que la PLATAFORMA añade sobre el mismo hecho (la apertura que ordenó,
 * «la cámara decidió por su cuenta») lleva la misma referencia y un sufijo:
 * se deduplica igual y no choca con la del equipo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const SEGURO = /^[A-Za-z0-9_.:-]{1,110}$/;

const referenciaDe = (evento: EventoDeEquipo, ids: GeneradorDeId): string => {
  const propia = evento.referenciaDelEquipo;
  if (propia !== null && SEGURO.test(propia)) return propia;
  const compacta = (propia ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 60);
  return compacta === '' ? `sinref.${ids.nuevo()}` : `r.${compacta}`;
};

export interface ExtraDeFila {
  readonly origen?: 'equipo' | 'plataforma';
  readonly tipo?: string;
  readonly titulo?: string;
  readonly eventoId?: string | null;
  readonly sufijo?: string;
  readonly carga?: Readonly<Record<string, unknown>>;
  readonly creadoPor?: string;
}

export const filaDeEventoDeEquipo = (
  evento: EventoDeEquipo,
  copropiedadId: string,
  ids: GeneradorDeId,
  extra: ExtraDeFila = {},
): EventoDeEquipoNuevo => {
  const origen = extra.origen ?? 'equipo';
  const referencia = `${referenciaDe(evento, ids)}${extra.sufijo === undefined ? '' : `.${extra.sufijo}`}`;
  const clave = construirClaveIdempotencia({
    copropiedadId,
    dispositivoId: evento.dispositivoId,
    origen,
    referenciaExterna: referencia,
  });
  return {
    copropiedadId,
    dispositivoId: evento.dispositivoId,
    tipo: extra.tipo ?? evento.tipo,
    titulo: extra.titulo ?? evento.titulo,
    codigoMayor: evento.codigo?.mayor ?? null,
    codigoMenor: evento.codigo?.menor ?? null,
    origen,
    enVivo: evento.enVivo,
    ocurridoEn: evento.ocurridoEn,
    horaDelEquipo: evento.horaDelEquipo,
    eventoId: extra.eventoId ?? null,
    // Si la clave del dominio no admite algo, se usa una única: la fila entra.
    claveIdempotencia: clave.ok ? clave.valor : `${copropiedadId}:${origen}:${ids.nuevo()}`,
    carga: extra.carga ?? evento.carga,
    creadoPor: extra.creadoPor ?? ACTOR_INGESTA,
  };
};

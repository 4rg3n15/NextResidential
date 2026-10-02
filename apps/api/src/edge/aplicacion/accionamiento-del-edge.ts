import { construirClaveIdempotencia } from '@ncr/domain-core';
import type { EventoDeEquipoNuevo } from '../../eventos';
import type { GatewayRegistrado } from './puertos';

/**
 * 15-Q · Q4 · LO QUE EL EDGE HIZO CON EL EQUIPO, EN LA LÍNEA DE TIEMPO.
 *
 * Cuando la nube abre, deja una constancia «apertura ordenada» en
 * `eventos_de_equipo` (15-L, A1). Cuando abre el Edge sin WAN tiene que quedar
 * la misma constancia, o el histórico diría que la talanquera se abrió sin que
 * nadie lo ordenara. Llega al reconciliar, con el instante REAL del Edge, y con
 * su propia clave de idempotencia —la del acceso más un sufijo—: reenviar el
 * lote no la duplica (RN-17).
 */

export interface AccionamientoDelEdge {
  readonly tipo: 'apertura' | 'veredicto';
  readonly estado: 'aceptada' | 'rechazada' | 'inalcanzable';
  readonly latenciaMs: number;
  readonly motivo?: string;
  readonly ocurridoEn: string;
}

export interface AccesoAccionado {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly referenciaExterna: string;
  readonly accionamiento: AccionamientoDelEdge;
}

const DESENLACE: Record<AccionamientoDelEdge['estado'], string> = {
  aceptada: 'el equipo la aceptó',
  rechazada: 'el equipo la rechazó',
  inalcanzable: 'el equipo no respondió',
};

export const constanciaDeAccionamiento = (
  acceso: AccesoAccionado,
  gateway: GatewayRegistrado,
  eventoId: string | null,
): EventoDeEquipoNuevo | null => {
  const { accionamiento: a } = acceso;
  const clave = construirClaveIdempotencia({
    copropiedadId: acceso.copropiedadId,
    dispositivoId: acceso.dispositivoId,
    origen: 'plataforma',
    referenciaExterna: `${acceso.referenciaExterna}.edge-${a.tipo}`,
  });
  // Sin clave admisible no se escribe: una constancia sin clave se duplicaría
  // en cada reenvío del lote.
  if (!clave.ok) return null;
  const que =
    a.tipo === 'apertura' ? 'Apertura ordenada por el Edge' : 'Veredicto del Edge a la terminal';
  return {
    copropiedadId: acceso.copropiedadId,
    dispositivoId: acceso.dispositivoId,
    tipo: a.tipo === 'apertura' ? 'apertura_ordenada' : 'resultado_de_verificacion',
    titulo:
      `${que} sin WAN: ${DESENLACE[a.estado]}${a.motivo === undefined ? '' : ` — ${a.motivo}`}`.slice(
        0,
        200,
      ),
    codigoMayor: null,
    codigoMenor: null,
    origen: 'plataforma',
    enVivo: true,
    ocurridoEn: new Date(a.ocurridoEn),
    horaDelEquipo: null,
    eventoId,
    claveIdempotencia: clave.valor,
    carga: {
      estado: a.estado,
      motivo: a.motivo ?? null,
      latenciaMs: a.latenciaMs,
      actor: `Edge «${gateway.nombre}» (contingencia sin WAN)`,
      edgeId: gateway.id,
    },
    creadoPor: gateway.usuarioServicioId,
  };
};

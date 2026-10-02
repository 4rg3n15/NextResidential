import type { ProveedorDeEquipos } from '@ncr/providers';
import type { AccionadorLocal } from '../../aplicacion/contingencia-en-sitio';

/**
 * 15-Q · Q4 · el brazo del Edge sobre los equipos: el MISMO `ProveedorDeEquipos`
 * que usa la nube (`packages/providers`), sin una línea de ISAPI aquí. La barrera
 * se abre con `abrir` —que antes comprueba que la cámara no decida sola, como
 * en la nube— y a la terminal se le contesta con `responderVerificacionRemota`.
 *
 * El actor de la orden es el Edge (RN-08): la apertura queda atribuida a él en
 * la constancia que la nube escribe al reconciliar.
 */
export class AccionadorPorProveedor implements AccionadorLocal {
  constructor(
    private readonly proveedor: Pick<ProveedorDeEquipos, 'abrir' | 'responderVerificacionRemota'>,
    private readonly actorId: string,
  ) {}

  async abrir(dispositivoId: string) {
    const r = await this.proveedor.abrir(dispositivoId, this.actorId);
    if (r.aceptado) return { estado: 'aceptada' as const, latenciaMs: r.latenciaMs };
    // Sin `rechazo`, «no aceptado» es que el equipo no contestó (O1, 15-N).
    return r.rechazo === undefined
      ? { estado: 'inalcanzable' as const, latenciaMs: r.latenciaMs }
      : { estado: 'rechazada' as const, latenciaMs: r.latenciaMs, motivo: r.rechazo };
  }

  async responderVeredicto(
    dispositivoId: string,
    veredicto: {
      readonly serie: number | null;
      readonly permitido: boolean;
      readonly motivo: string;
    },
  ) {
    const r = await this.proveedor.responderVerificacionRemota(dispositivoId, veredicto);
    return r.aceptado
      ? { estado: 'aceptada' as const, latenciaMs: r.latenciaMs }
      : { estado: 'inalcanzable' as const, latenciaMs: r.latenciaMs };
  }
}

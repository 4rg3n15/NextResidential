import { FUENTE_EN_EL_EDGE } from '@ncr/providers';
import type { CredencialesEnElEdge } from '../../comun/credenciales-en-el-edge';
import { copropiedadEnCurso } from '../../proveedores';
import { PuenteDeVideoFallo, PuenteDeVideoNoConfigurado } from '../aplicacion/puertos';
import type { PuenteDeVideo } from '../aplicacion/puertos';
import { redactar } from './puente-go2rtc';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · E2 · EL VIDEO DE UN EQUIPO CON PUENTE LO NEGOCIA EL go2rtc DEL EDGE
 *
 * El RTSP del equipo lleva su credencial y sólo se alcanza desde la red del
 * conjunto (D4): por eso el Edge contesta `origenDeVideo` con una fuente sin
 * credencial (`FUENTE_EN_EL_EDGE`), y aquí esa fuente se reconoce. La oferta SDP
 * del navegador viaja por el túnel (pedido `video.whep`), el go2rtc que corre
 * junto al Edge registra el flujo con la URL de verdad y contesta el SDP. El
 * navegador sigue negociando sólo con la API (sesión, rol y copropiedad ya
 * validados); el MEDIO va entre el navegador y el go2rtc del Edge por ICE, con
 * los STUN/TURN que se configuren (dónde vive el TURN: PENDIENTE DE DEFINICIÓN).
 *
 * Cualquier otra fuente va al puente de siempre (`directo`), o, sin él, falla
 * como antes: «falta GO2RTC_URL» (R1).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class PuenteDeVideoPorElEdge implements PuenteDeVideo {
  private readonly delEdge = new Map<string, string>();

  constructor(
    private readonly directo: PuenteDeVideo | null,
    private readonly edge: CredencialesEnElEdge,
  ) {}

  async asegurarFlujo(nombre: string, fuente: string): Promise<void> {
    if (fuente.startsWith(FUENTE_EN_EL_EDGE)) {
      this.delEdge.set(nombre, fuente.slice(FUENTE_EN_EL_EDGE.length));
      return;
    }
    this.delEdge.delete(nombre);
    if (this.directo === null) throw new PuenteDeVideoNoConfigurado();
    await this.directo.asegurarFlujo(nombre, fuente);
  }

  async negociar(nombre: string, ofertaSdp: string): Promise<string> {
    const dispositivoId = this.delEdge.get(nombre);
    if (dispositivoId === undefined) {
      if (this.directo === null) throw new PuenteDeVideoNoConfigurado();
      return this.directo.negociar(nombre, ofertaSdp);
    }
    const copropiedadId = copropiedadEnCurso();
    if (copropiedadId === undefined) {
      throw new PuenteDeVideoFallo('la negociación no llegó por la ruta de su copropiedad');
    }
    try {
      const sdp = await this.edge.pedir(
        copropiedadId,
        'video.whep',
        { dispositivoId, nombre, ofertaSdp },
        15_000,
      );
      if (typeof sdp !== 'string' || !sdp.startsWith('v=0')) {
        throw new PuenteDeVideoFallo('el go2rtc del Edge no contestó SDP');
      }
      return sdp;
    } catch (error) {
      if (error instanceof PuenteDeVideoFallo) throw error;
      const motivo = error instanceof Error ? error.message : String(error);
      throw new PuenteDeVideoFallo(`go2rtc del Edge: ${redactar(motivo)}`);
    }
  }
}

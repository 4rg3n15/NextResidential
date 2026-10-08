import type { FactoryProvider } from '@nestjs/common';
import { BITACORA, RELOJ } from '@ncr/domain-core';
import { FUENTE_EN_EL_EDGE } from '@ncr/providers';
import { CREDENCIALES_EN_EL_EDGE } from '../../comun/credenciales-en-el-edge';
import { PROVEEDOR_DE_EQUIPOS } from '../../proveedores';
import { PUENTE_DE_VIDEO } from '../aplicacion/puertos';
import type { CredencialesEnElEdge } from '../../comun/credenciales-en-el-edge';
import { copropiedadEnCurso } from '../../proveedores';
import { PuenteDeVideoFallo, PuenteDeVideoNoConfigurado } from '../aplicacion/puertos';
import type { PoliticaDeTranscodificacion, PuenteDeVideo } from '../aplicacion/puertos';
import { CONFIGURACION } from '../../configuracion/configuracion.module';
import type { Configuracion } from '../../configuracion/esquema';
import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { ProveedorDeEquipos } from '@ncr/providers';
import { NegociarVistaEnVivo } from '../aplicacion/vista-en-vivo';
import type { SolicitudDeVistaEnVivo } from '../aplicacion/vista-en-vivo';
import { redactar } from './puente-go2rtc';
import { REGLA_DE_VIDEO } from './regla-de-video';

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

  /** A3 (15-S2) · el go2rtc del Edge no transcodifica (aún): para sus flujos, `null`. */
  async asegurarTranscodificado(nombre: string): Promise<string | null> {
    if (this.delEdge.has(nombre) || this.directo?.asegurarTranscodificado === undefined)
      return null;
    return this.directo.asegurarTranscodificado(nombre);
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

type Negociacion = Pick<NegociarVistaEnVivo, 'ejecutar'>;

/**
 * R1 · la elección es POR COPROPIEDAD: sin Edge puente, el caso de uso de
 * siempre —con el go2rtc de la API o, sin `GO2RTC_URL`, su 503 ANTES de mirar
 * el equipo—; con puente, el que negocia por el go2rtc del Edge.
 */
export class VistaEnVivoPorCopropiedad implements Negociacion {
  constructor(
    private readonly deSiempre: Negociacion,
    private readonly porElEdge: Negociacion,
    private readonly edge: CredencialesEnElEdge,
  ) {}

  async ejecutar(solicitud: SolicitudDeVistaEnVivo) {
    const puente = await this.edge.puenteDe(solicitud.copropiedadId);
    return (puente === null ? this.deSiempre : this.porElEdge).ejecutar(solicitud);
  }
}

/** La fábrica del caso de uso en `guardia.module`: sin Edge en la app, el de siempre, tal cual. */
export const vistaEnVivoPorCopropiedad = (
  proveedor: ProveedorDeEquipos,
  puente: PuenteDeVideo | null,
  bitacora: Bitacora,
  reloj: Reloj,
  edge?: CredencialesEnElEdge | null,
  transcodificar: PoliticaDeTranscodificacion = 'auto',
): Negociacion => {
  const deSiempre = new NegociarVistaEnVivo(
    proveedor,
    puente,
    bitacora,
    reloj,
    transcodificar,
    REGLA_DE_VIDEO,
  );
  if (edge === undefined || edge === null) return deSiempre;
  const conEdge = new NegociarVistaEnVivo(
    proveedor,
    new PuenteDeVideoPorElEdge(puente, edge),
    bitacora,
    reloj,
    transcodificar,
    REGLA_DE_VIDEO,
  );
  return new VistaEnVivoPorCopropiedad(deSiempre, conEdge, edge);
};

export const PROVEEDOR_DE_VISTA_EN_VIVO: FactoryProvider<Negociacion> = {
  provide: NegociarVistaEnVivo,
  inject: [
    PROVEEDOR_DE_EQUIPOS,
    PUENTE_DE_VIDEO,
    BITACORA,
    RELOJ,
    CONFIGURACION,
    { token: CREDENCIALES_EN_EL_EDGE, optional: true },
  ],
  useFactory: (
    proveedor: ProveedorDeEquipos,
    puente: PuenteDeVideo | null,
    bitacora: Bitacora,
    reloj: Reloj,
    configuracion: Configuracion,
    edge?: CredencialesEnElEdge | null,
  ) =>
    vistaEnVivoPorCopropiedad(
      proveedor,
      puente,
      bitacora,
      reloj,
      edge,
      configuracion.VIDEO_TRANSCODIFICAR,
    ),
};

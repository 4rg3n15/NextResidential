import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { ProveedorDeEquipos } from '@ncr/providers';
import { codecsDeLaOferta, decidirViaDeVideo, fraseDeVideoNoReproducible } from '@ncr/providers';
import type { PoliticaDeTranscodificacion, PuenteDeVideo } from './puertos';
import { PuenteDeVideoFallo, PuenteDeVideoNoConfigurado, SinOrigenDeVideo } from './puertos';
import { explicarFalloDelPuente } from './causas-de-video';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * NEGOCIAR LA VISTA EN VIVO · ETAPA 15-E (A5)
 *
 * El navegador quiere ver el equipo. Lo que NO puede hacer es hablar con el
 * equipo ni con el puente: la URL RTSP lleva la credencial (RN-12, RN-21) y el
 * puente no sabe de sesiones ni de copropiedades. Así que la negociación pasa
 * por aquí, en este orden y por estas razones:
 *
 *  1. ¿Hay puente? Sin `GO2RTC_URL` la respuesta es «no desplegado», con esas
 *     palabras, antes de tocar el proveedor.
 *  2. El PROVEEDOR resuelve el origen de video del equipo. Es él quien sabe
 *     construir la URL del fabricante y quien tiene la credencial descifrada;
 *     esta capa recibe una fuente opaca y la pasa. `null` significa que el
 *     equipo no ofrece video (un controlador de E/S, por ejemplo) y un fallo
 *     al resolverlo —no está en el registro, el simulado no lo conoce— se
 *     reporta igual: como «sin video», con el motivo.
 *  3. Se asegura el flujo en el puente y se negocia. La fuente NO se anota en
 *     bitácora: se anota qué equipo, qué flujo y cuánto tardó (KPI-33).
 *     E2/C1 (15-M) · lo que el puente conteste mal sale de aquí EN PALABRAS y
 *     con remedio (`causas-de-video.ts`), nunca un «HTTP 500 · EOF» a secas.
 *
 *  4. A2/A3 (15-S2) · ANTES del puente se decide la vía con el códec del
 *     equipo y la oferta del navegador (`decidirViaDeVideo`): directo,
 *     transcodificado a H.264 por el puente, o no reproducible con sus tres
 *     remedios. Lo que no se puede ver se dice sin tocar el puente.
 *
 * El nombre del flujo es el identificador del dispositivo con prefijo: único
 * entre copropiedades sin que el puente tenga que saber de tenants.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface SolicitudDeVistaEnVivo {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly operadorId: string;
  readonly ofertaSdp: string;
}

export interface VistaEnVivoNegociada {
  readonly respuestaSdp: string;
  readonly flujo: 'principal' | 'secundario';
  readonly detalle: string;
  readonly latenciaMs: number;
  /** A5 (15-S2) · por dónde se sirvió: directo o transcodificado a H.264 por el puente. */
  readonly via: 'directo' | 'transcodificado';
}

export const nombreDeFlujo = (dispositivoId: string): string => `ncr-${dispositivoId}`;

/**
 * V5 (15-N) · go2rtc contesta «wrong response on DESCRIBE» para 403, 404, 412
 * y 454 por igual, y «wrong user/pass» también cuando el equipo sólo acepta
 * SHA-256 (medido con el binario oficial). Con estos dos, el código lo sabe
 * el EQUIPO: se le pregunta por RTSP antes de contestar al operador.
 */
const PIDE_PREGUNTAR_AL_EQUIPO = /wrong response on DESCRIBE|wrong user\/pass/i;

/**
 * V5 (15-N) · ¿la respuesta del puente trae video que el navegador vaya a
 * recibir? Con un equipo en H.265 y una oferta sin H.265, go2rtc contesta 201
 * con la sección de video `inactive`: la consola quedaba en negro.
 */
export const videoActivoEnRespuesta = (sdp: string): boolean => {
  const secciones = sdp.split(/\r?\n(?=m=)/);
  const video = secciones.find((s) => s.startsWith('m=video'));
  if (video === undefined) return false;
  if (/^m=video 0 /.test(video)) return false;
  return !/^a=inactive\s*$/m.test(video);
};

export class NegociarVistaEnVivo {
  constructor(
    private readonly proveedor: ProveedorDeEquipos,
    private readonly puente: PuenteDeVideo | null,
    private readonly bitacora: Bitacora,
    private readonly reloj: Reloj,
    private readonly transcodificar: PoliticaDeTranscodificacion = 'auto',
  ) {}

  /**
   * A3 (15-S2) · el flujo transcodificado que registra el puente. Un puente
   * que no puede con ESE flujo (el que sirve el Edge) devuelve `null`, y se
   * vuelve a decidir sin transcodificación para dar el motivo correcto.
   */
  private async transcodificado(
    asegurar: (nombre: string) => Promise<string | null>,
    nombre: string,
    codec: string | null,
    ofertados: ReadonlySet<string>,
  ): Promise<{ readonly flujo: string } | { readonly motivo: string }> {
    const derivado = await asegurar(nombre);
    if (derivado !== null) return { flujo: derivado };
    const sin = decidirViaDeVideo(codec, ofertados, false);
    return { motivo: sin.via === 'no_reproducible' ? sin.motivo : 'el puente no transcodifica' };
  }

  /**
   * El fallo en palabras (E2/C1) y, cuando el puente no dice el código, con lo
   * que contesta el equipo (V5). La sonda no puede empeorar la respuesta: si
   * falla, queda la explicación del puente.
   */
  private async explicar(
    dispositivoId: string,
    motivo: string,
    sinVideo = false,
  ): Promise<PuenteDeVideoFallo> {
    const preguntar = sinVideo || PIDE_PREGUNTAR_AL_EQUIPO.test(motivo);
    if (preguntar && this.proveedor.sondearVideo !== undefined) {
      const diagnostico = await this.proveedor.sondearVideo(dispositivoId).catch(() => null);
      if (diagnostico !== null && diagnostico.causa !== 'ninguna') {
        return new PuenteDeVideoFallo(`${diagnostico.frase} (${motivo})`);
      }
    }
    return new PuenteDeVideoFallo(explicarFalloDelPuente(motivo));
  }

  async ejecutar(solicitud: SolicitudDeVistaEnVivo): Promise<VistaEnVivoNegociada> {
    if (this.puente === null) throw new PuenteDeVideoNoConfigurado();
    const { dispositivoId, operadorId } = solicitud;

    let origen: Awaited<ReturnType<ProveedorDeEquipos['origenDeVideo']>>;
    try {
      origen = await this.proveedor.origenDeVideo(dispositivoId);
    } catch (error) {
      throw new SinOrigenDeVideo(
        dispositivoId,
        error instanceof Error ? error.message : String(error),
      );
    }
    if (origen === null) {
      throw new SinOrigenDeVideo(dispositivoId, 'este tipo de equipo no emite video');
    }

    const nombre = nombreDeFlujo(dispositivoId);
    const codec = origen.codec ?? null;
    const ofertados = codecsDeLaOferta(solicitud.ofertaSdp);
    const noReproducible = (motivo: string): SinOrigenDeVideo =>
      new SinOrigenDeVideo(
        dispositivoId,
        fraseDeVideoNoReproducible(codec ?? 'un códec', origen.canal ?? null, motivo),
      );
    const puente = this.puente;
    const asegurar = puente.asegurarTranscodificado?.bind(puente);
    const transcodifica = this.transcodificar === 'auto' && asegurar !== undefined;
    const via = decidirViaDeVideo(codec, ofertados, transcodifica);
    // A4 · sin vía posible se dice ANTES de tocar el puente.
    if (via.via === 'no_reproducible') throw noReproducible(via.motivo);
    const inicio = this.reloj.ahora().getTime();
    let respuestaSdp: string;
    let flujo = nombre;
    try {
      await puente.asegurarFlujo(nombre, origen.rtsp);
      if (via.via === 'transcodificado' && asegurar !== undefined) {
        const eleccion = await this.transcodificado(asegurar, nombre, codec, ofertados);
        if ('motivo' in eleccion) throw noReproducible(eleccion.motivo);
        flujo = eleccion.flujo;
      }
      respuestaSdp = await puente.negociar(flujo, solicitud.ofertaSdp);
    } catch (error) {
      if (!(error instanceof PuenteDeVideoFallo)) throw error;
      throw await this.explicar(dispositivoId, error.motivo);
    }
    if (!videoActivoEnRespuesta(respuestaSdp)) {
      throw await this.explicar(
        dispositivoId,
        'el puente negoció sin video: el equipo entrega un códec que el navegador no reproduce',
        true,
      );
    }
    const latenciaMs = this.reloj.ahora().getTime() - inicio;
    this.bitacora.registrar('info', 'vista en vivo negociada con el puente', {
      dispositivoId,
      operadorId,
      copropiedadId: solicitud.copropiedadId,
      flujo: origen.flujo,
      latenciaMs,
      via: via.via,
      codec,
    });
    return { respuestaSdp, flujo: origen.flujo, detalle: origen.detalle, latenciaMs, via: via.via };
  }
}

import type { Bitacora, Reloj } from '@ncr/domain-core';
import type { ProveedorDeEquipos } from '@ncr/providers';
import type { PuenteDeVideo } from './puertos';
import { PuenteDeVideoNoConfigurado, SinOrigenDeVideo } from './puertos';

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
}

export const nombreDeFlujo = (dispositivoId: string): string => `ncr-${dispositivoId}`;

export class NegociarVistaEnVivo {
  constructor(
    private readonly proveedor: ProveedorDeEquipos,
    private readonly puente: PuenteDeVideo | null,
    private readonly bitacora: Bitacora,
    private readonly reloj: Reloj,
  ) {}

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
    const inicio = this.reloj.ahora().getTime();
    await this.puente.asegurarFlujo(nombre, origen.rtsp);
    const respuestaSdp = await this.puente.negociar(nombre, solicitud.ofertaSdp);
    const latenciaMs = this.reloj.ahora().getTime() - inicio;
    this.bitacora.registrar('info', 'vista en vivo negociada con el puente', {
      dispositivoId,
      operadorId,
      copropiedadId: solicitud.copropiedadId,
      flujo: origen.flujo,
      latenciaMs,
    });
    return { respuestaSdp, flujo: origen.flujo, detalle: origen.detalle, latenciaMs };
  }
}

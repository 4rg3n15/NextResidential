import type { PuenteDeVideo } from '../aplicacion/puertos';
import { PuenteDeVideoFallo } from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PUENTE DE VIDEO SOBRE go2rtc · ETAPA 15-E (A5)
 *
 * go2rtc recibe el RTSP del equipo y lo sirve por WebRTC. Dos llamadas de su
 * API HTTP, y ninguna más:
 *
 *  - `PUT /api/streams?name=<nombre>&src=<rtsp>` registra la fuente bajo el
 *    nombre; volver a hacerlo REEMPLAZA la fuente, así que es idempotente y
 *    sirve también cuando la credencial del equipo cambió `[SUPUESTO S-47]`.
 *  - `POST /api/webrtc?src=<nombre>` con `Content-Type: application/sdp` es el
 *    WHEP de go2rtc: la oferta va en el cuerpo y la respuesta SDP vuelve con
 *    `201` (o `200`).
 *
 * La fuente lleva la credencial del equipo. Por eso este adaptador es el único
 * sitio de la API que la ve, y por eso NINGÚN error sale de aquí con ella
 * dentro: `redactar` quita cualquier `rtsp://…` de lo que go2rtc responda
 * antes de convertirlo en motivo (RN-21).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type FetchDelPuente = (url: string, init: RequestInit) => Promise<Response>;

/** Cuánto se espera al puente. Si no negocia en este plazo, KPI-33 ya no se cumple. */
export const PLAZO_DEL_PUENTE_MS = 5_000;

/** Cualquier URL RTSP —lleva usuario y clave— se sustituye antes de salir. */
export const redactar = (texto: string): string =>
  texto.replace(/rtsps?:\/\/[^\s"'<>]+/gi, 'rtsp://[redactado]');

export class PuenteGo2rtc implements PuenteDeVideo {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly fetchFn: FetchDelPuente = (url, init) => fetch(url, init),
    private readonly plazoMs: number = PLAZO_DEL_PUENTE_MS,
  ) {
    this.base = baseUrl.replace(/\/+$/, '');
  }

  private async llamar(ruta: string, init: RequestInit, que: string): Promise<Response> {
    let respuesta: Response;
    try {
      respuesta = await this.fetchFn(`${this.base}${ruta}`, {
        ...init,
        signal: AbortSignal.timeout(this.plazoMs),
      });
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      throw new PuenteDeVideoFallo(`${que}: ${redactar(motivo)}`);
    }
    if (!respuesta.ok) {
      const detalle = redactar((await respuesta.text().catch(() => '')).slice(0, 200));
      throw new PuenteDeVideoFallo(
        `${que}: HTTP ${String(respuesta.status)}${detalle === '' ? '' : ` · ${detalle}`}`,
      );
    }
    return respuesta;
  }

  async asegurarFlujo(nombre: string, fuente: string): Promise<void> {
    const consulta = new URLSearchParams({ name: nombre, src: fuente });
    await this.llamar(
      `/api/streams?${consulta.toString()}`,
      { method: 'PUT' },
      'registro del flujo en el puente',
    );
  }

  async negociar(nombre: string, ofertaSdp: string): Promise<string> {
    const consulta = new URLSearchParams({ src: nombre });
    const respuesta = await this.llamar(
      `/api/webrtc?${consulta.toString()}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/sdp', accept: 'application/sdp' },
        body: ofertaSdp,
      },
      'negociación WebRTC con el puente',
    );
    const sdp = await respuesta.text();
    if (!sdp.startsWith('v=0')) {
      throw new PuenteDeVideoFallo('negociación WebRTC con el puente: la respuesta no es SDP');
    }
    return sdp;
  }
}

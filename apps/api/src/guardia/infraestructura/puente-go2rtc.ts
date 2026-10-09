import type { PuenteDeVideo } from '../aplicacion/puertos';
import { PuenteDeVideoFallo } from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL PUENTE DE VIDEO SOBRE go2rtc · ETAPA 15-E (A5)
 *
 * go2rtc recibe el RTSP del equipo y lo sirve por WebRTC. Dos llamadas de su
 * API HTTP, y ninguna más:
 *
 *  - `PATCH /api/streams?name=<nombre>&src=<rtsp>` registra la fuente bajo el
 *    nombre EN MEMORIA; volver a hacerlo la reemplaza, así que es idempotente
 *    y sirve también cuando la credencial del equipo cambió `[SUPUESTO S-47]`.
 *    Hasta la 15-M era `PUT`, y en sitio (28/09) se vio lo que eso hace: go2rtc
 *    ESCRIBE la fuente —con la credencial— en su `go2rtc.yaml`, y con un
 *    `streams: {}` en el fichero contesta 400 («did not find expected key»).
 *    Con `PATCH` el fichero no se toca (RN-21); comprobado con el binario real
 *    en `puente-go2rtc.real.test.ts`.
 *  - `POST /api/webrtc?src=<nombre>` con `Content-Type: application/sdp` es el
 *    WHEP de go2rtc: la oferta va en el cuerpo y la respuesta SDP vuelve con
 *    `201` (o `200`).
 *
 *  - A3 (15-S2) · `PATCH /api/streams?name=<nombre>-h264&src=ffmpeg:<nombre>#video=h264`
 *    registra el MISMO flujo transcodificado a H.264. La fuente referencia el
 *    flujo por su NOMBRE: go2rtc lanza ffmpeg contra su RTSP interno
 *    (`rtsp://127.0.0.1:<puerto>/<nombre>`), así que la credencial del equipo
 *    no aparece ni en la fuente ni en los argumentos del proceso (RN-21;
 *    medido con `ps` en el banco de la 15-S2). Exige el RTSP interno de go2rtc
 *    en 127.0.0.1, que `pnpm sitio:video` enciende con VIDEO_TRANSCODIFICAR=auto.
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

/**
 * V1 (15-N) · SDP (RFC 8866) termina cada línea en CRLF, también la última, y
 * el analizador del puente la EXIGE: sin ella lee fin de flujo y contesta
 * «EOF» sin llegar al equipo (Bloque 0: `webrtc.go:272`, `SetOffer`). Un
 * navegador la manda; cualquier otro cliente —o un intermediario que recorte—
 * puede no hacerlo. Se repone aquí, que es el último punto antes del puente.
 */
export const conFinDeLinea = (sdp: string): string =>
  sdp.endsWith('\r\n') ? sdp : `${sdp.replace(/[\r\n]+$/, '')}\r\n`;

/** A3 (15-S2) · el flujo transcodificado: nombre derivado y fuente que referencia el original. */
export const flujoTranscodificado = (
  nombre: string,
): { readonly nombre: string; readonly fuente: string } => ({
  nombre: `${nombre}-h264`,
  fuente: `ffmpeg:${nombre}#video=h264`,
});

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
      { method: 'PATCH' },
      'registro del flujo en el puente',
    );
  }

  async asegurarTranscodificado(nombre: string): Promise<string> {
    const derivado = flujoTranscodificado(nombre);
    await this.asegurarFlujo(derivado.nombre, derivado.fuente);
    return derivado.nombre;
  }

  async negociar(nombre: string, ofertaSdp: string): Promise<string> {
    const consulta = new URLSearchParams({ src: nombre });
    const respuesta = await this.llamar(
      `/api/webrtc?${consulta.toString()}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/sdp', accept: 'application/sdp' },
        body: conFinDeLinea(ofertaSdp),
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

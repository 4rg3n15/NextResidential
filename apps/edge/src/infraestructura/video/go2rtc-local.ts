/**
 * 15-Q2 · D4/E2 · el go2rtc que corre JUNTO al Edge (`EDGE_GO2RTC_URL`, sólo
 * en la máquina local). Recibe la URL RTSP con la credencial —que nunca sale
 * del conjunto— y la oferta SDP que el navegador mandó a la API por el túnel.
 * Lo que go2rtc conteste se limpia de cualquier `rtsp://…` antes de devolverlo.
 */
export const limpiarRtsp = (texto: string): string =>
  texto.replace(/rtsps?:\/\/[^\s"'<>]+/gi, 'rtsp://[redactado]');

const conFinDeLinea = (sdp: string): string =>
  sdp.endsWith('\r\n') ? sdp : `${sdp.replace(/[\r\n]+$/, '')}\r\n`;

export class Go2rtcLocal {
  private readonly base: string;

  constructor(
    url: string,
    private readonly peticion: typeof fetch = fetch,
    private readonly plazoMs = 5_000,
  ) {
    this.base = url.replace(/\/+$/, '');
  }

  async negociar(nombre: string, rtsp: string, ofertaSdp: string): Promise<string> {
    await this.llamar(
      `/api/streams?${new URLSearchParams({ name: nombre, src: rtsp }).toString()}`,
      { method: 'PATCH' },
    );
    const respuesta = await this.llamar(
      `/api/webrtc?${new URLSearchParams({ src: nombre }).toString()}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/sdp', accept: 'application/sdp' },
        body: conFinDeLinea(ofertaSdp),
      },
    );
    const sdp = await respuesta.text();
    if (!sdp.startsWith('v=0')) throw new Error('go2rtc local: la respuesta no es SDP');
    return sdp;
  }

  private async llamar(ruta: string, init: RequestInit): Promise<Response> {
    let r: Response;
    try {
      r = await this.peticion(`${this.base}${ruta}`, {
        ...init,
        signal: AbortSignal.timeout(this.plazoMs),
      });
    } catch (error) {
      throw new Error(
        `go2rtc local: ${limpiarRtsp(error instanceof Error ? error.message : String(error))}`,
      );
    }
    if (!r.ok) {
      const detalle = limpiarRtsp((await r.text().catch(() => '')).slice(0, 200));
      throw new Error(
        `go2rtc local: HTTP ${String(r.status)}${detalle === '' ? '' : ` · ${detalle}`}`,
      );
    }
    return r;
  }
}

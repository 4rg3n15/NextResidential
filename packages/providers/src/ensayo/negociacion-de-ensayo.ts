/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A5 (15-S2) · LAS LLAMADAS DEL PASO 7 AL PUENTE, Y EL PRIMER CUADRO
 *
 * Las mismas que hace la API (`PATCH /api/streams`, `POST /api/webrtc`) y una
 * más: `GET /api/stream.mp4` hasta el primer fragmento con medios (`mdat`).
 * Es el PRIMER CUADRO que el puente entrega, y es lo que hay que comparar con
 * los 2 s de KPI-33: medido en el banco de la 15-S2 con go2rtc v1.9.14, la
 * respuesta SDP transcodificada llegó en 245 ms con una entrada rápida de
 * ffmpeg y aun así el primer cuadro tardó 2,5 s. El tiempo de la SDP, solo,
 * engaña.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type FetchDeEnsayo = typeof fetch;

export interface Negociado {
  readonly estado: number;
  readonly cuerpo: string;
  readonly ms: number;
}

/** El bloque MP4 que trae medios: con él ya hay un cuadro que mostrar. */
const MDAT = Buffer.from('mdat');

export class PuenteDelEnsayo {
  private readonly base: string;

  constructor(
    url: string,
    private readonly fetchFn: FetchDeEnsayo,
  ) {
    this.base = url.replace(/\/+$/, '');
  }

  registrar(nombre: string, src: string): Promise<Response> {
    return this.fetchFn(
      `${this.base}/api/streams?${new URLSearchParams({ name: nombre, src }).toString()}`,
      { method: 'PATCH', signal: AbortSignal.timeout(5000) },
    );
  }

  async negociar(nombre: string, oferta: string): Promise<Negociado> {
    const inicio = Date.now();
    const r = await this.fetchFn(
      `${this.base}/api/webrtc?${new URLSearchParams({ src: nombre }).toString()}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/sdp', accept: 'application/sdp' },
        body: oferta,
        signal: AbortSignal.timeout(15_000),
      },
    );
    const cuerpo = await r.text().catch(() => '');
    return { estado: r.status, cuerpo, ms: Date.now() - inicio };
  }

  /** ms hasta el primer fragmento con medios, o `null` si no llega en el plazo o falla. */
  async primerCuadro(nombre: string, plazoMs = 10_000): Promise<number | null> {
    const inicio = Date.now();
    const control = new AbortController();
    const vence = setTimeout(() => control.abort(), plazoMs);
    try {
      const r = await this.fetchFn(
        `${this.base}/api/stream.mp4?${new URLSearchParams({ src: nombre }).toString()}`,
        { method: 'GET', signal: control.signal },
      );
      if (!r.ok || r.body === null) return null;
      const lector = r.body.getReader();
      let previo = Buffer.alloc(0);
      for (;;) {
        const { value, done } = await lector.read();
        if (done) return null;
        // Lo justo del trozo anterior para encontrar «mdat» partido en dos.
        const ventana = Buffer.concat([previo, Buffer.from(value)]);
        if (ventana.includes(MDAT)) return Date.now() - inicio;
        previo = ventana.subarray(Math.max(0, ventana.length - (MDAT.length - 1)));
      }
    } catch {
      return null;
    } finally {
      clearTimeout(vence);
      control.abort();
    }
  }

  /** Sin esperar: el ensayo no deja flujos en el puente, y un fallo aquí no cambia nada. */
  retirar(nombres: readonly string[]): void {
    for (const nombre of nombres) {
      void this.fetchFn(
        `${this.base}/api/streams?${new URLSearchParams({ src: nombre }).toString()}`,
        { method: 'DELETE', signal: AbortSignal.timeout(2000) },
      ).catch(() => undefined);
    }
  }
}

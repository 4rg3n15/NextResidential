/**
 * A5 (15-E) · NEGOCIACIÓN WHEP DESDE EL NAVEGADOR, CONTRA LA API.
 *
 * El navegador no habla con go2rtc ni con el equipo: manda su oferta SDP a la
 * API por el proxy de la consola (`/api/ncr/…`), que valida sesión, rol y
 * copropiedad y negocia en su nombre. Lo único que llega aquí es una respuesta
 * SDP; el medio viaja por WebRTC entre el navegador y el puente, sin RTSP ni
 * credenciales de por medio (RN-12, RN-21).
 *
 * Reproducir video WebRTC en modo «sólo recibir» NO exige contexto seguro:
 * `RTCPeerConnection` está disponible por `http://<IP>`. Lo que sí lo exige es
 * el micrófono (`getUserMedia`, en `lib/audio/puente.ts`): por eso en sitio se
 * ve la cámara por IP y se habla sólo por `https` o `localhost`.
 */
export type CodigoDeVistaEnVivo =
  | 'sin_puente' // 503 · la API no tiene GO2RTC_URL
  | 'sin_video' // 409 · el equipo no ofrece video
  | 'puente' // 502 · el puente falló
  | 'sin_permiso' // 401 · 403 · 404
  | 'navegador' // sin RTCPeerConnection
  | 'red'; // cualquier otra cosa

export class ErrorDeVistaEnVivo extends Error {
  constructor(
    readonly codigo: CodigoDeVistaEnVivo,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorDeVistaEnVivo';
  }
}

export interface ConexionEnVivo {
  /** Milisegundos entre enviar la oferta y aplicar la respuesta. */
  readonly latenciaNegociacionMs: number;
  cerrar(): void;
}

export interface OpcionesDeNegociacion {
  /** Se invoca cuando llega el flujo de video; el componente lo cuelga del `<video>`. */
  readonly alFlujo: (flujo: MediaStream) => void;
  /** Inyectable para las pruebas: por omisión, el `RTCPeerConnection` del navegador. */
  readonly crearConexion?: (configuracion: RTCConfiguration) => RTCPeerConnection;
  readonly fetchFn?: typeof fetch;
  /** Cuánto se espera a que el ICE local termine antes de mandar la oferta. */
  readonly plazoIceMs?: number;
}

export const rutaWhep = (copropiedadId: string, dispositivoId: string): string =>
  `/api/ncr/copropiedades/${encodeURIComponent(copropiedadId)}/guardia/video/${encodeURIComponent(dispositivoId)}/whep`;

const codigoSegunEstado = (estado: number): CodigoDeVistaEnVivo => {
  if (estado === 503) return 'sin_puente';
  if (estado === 409) return 'sin_video';
  if (estado === 502) return 'puente';
  if (estado === 401 || estado === 403 || estado === 404) return 'sin_permiso';
  return 'red';
};

const mensajeDe = async (respuesta: Response): Promise<string> => {
  const texto = await respuesta.text().catch(() => '');
  try {
    const cuerpo: unknown = JSON.parse(texto);
    if (typeof cuerpo === 'object' && cuerpo !== null && 'mensaje' in cuerpo) {
      const { mensaje } = cuerpo as { mensaje: unknown };
      if (typeof mensaje === 'string') return mensaje;
    }
  } catch {
    // no era JSON: se usa el texto tal cual
  }
  return texto === '' ? `HTTP ${String(respuesta.status)}` : texto.slice(0, 200);
};

/** Espera al ICE local completo, o al plazo: WHEP sin «trickle» manda todo junto. */
const esperarIce = (conexion: RTCPeerConnection, plazoMs: number): Promise<void> =>
  new Promise((resolver) => {
    if (conexion.iceGatheringState === 'complete') {
      resolver();
      return;
    }
    const temporizador = setTimeout(terminar, plazoMs);
    function terminar(): void {
      clearTimeout(temporizador);
      conexion.removeEventListener('icegatheringstatechange', alCambiar);
      resolver();
    }
    function alCambiar(): void {
      if (conexion.iceGatheringState === 'complete') terminar();
    }
    conexion.addEventListener('icegatheringstatechange', alCambiar);
  });

const conexionPorOmision = (): ((c: RTCConfiguration) => RTCPeerConnection) | undefined =>
  typeof RTCPeerConnection === 'function' ? (c) => new RTCPeerConnection(c) : undefined;

export const negociarVistaEnVivo = async (
  url: string,
  opciones: OpcionesDeNegociacion,
): Promise<ConexionEnVivo> => {
  const crear = opciones.crearConexion ?? conexionPorOmision();
  if (crear === undefined) {
    throw new ErrorDeVistaEnVivo('navegador', 'Este navegador no ofrece WebRTC');
  }
  const fetchFn = opciones.fetchFn ?? ((entrada, init) => fetch(entrada, init));
  // Sin STUN a propósito: consola y puente están en la misma red del conjunto,
  // y los candidatos del puente los pone go2rtc (`webrtc.candidates`).
  const conexion = crear({ iceServers: [] });
  conexion.addEventListener('track', (evento) => {
    const [flujo] = evento.streams;
    if (flujo !== undefined) opciones.alFlujo(flujo);
  });
  try {
    conexion.addTransceiver('video', { direction: 'recvonly' });
    const oferta = await conexion.createOffer();
    await conexion.setLocalDescription(oferta);
    await esperarIce(conexion, opciones.plazoIceMs ?? 1500);
    const sdp = conexion.localDescription?.sdp ?? oferta.sdp ?? '';

    const inicio = performance.now();
    const respuesta = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/sdp', accept: 'application/sdp' },
      body: sdp,
      cache: 'no-store',
    });
    if (!respuesta.ok) {
      throw new ErrorDeVistaEnVivo(codigoSegunEstado(respuesta.status), await mensajeDe(respuesta));
    }
    await conexion.setRemoteDescription({ type: 'answer', sdp: await respuesta.text() });
    return {
      latenciaNegociacionMs: Math.round(performance.now() - inicio),
      cerrar: () => conexion.close(),
    };
  } catch (error) {
    conexion.close();
    if (error instanceof ErrorDeVistaEnVivo) throw error;
    throw new ErrorDeVistaEnVivo('red', error instanceof Error ? error.message : String(error));
  }
};

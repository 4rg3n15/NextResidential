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
import { iceDe } from './ice';
import type { OpcionesDeIce } from './ice';
export type CodigoDeVistaEnVivo =
  | 'sin_api' // 502 del proxy o 503 del arranque: la API no está para contestar
  | 'sin_puente' // 503 · la API no tiene GO2RTC_URL
  | 'sin_video' // 409 · el equipo no ofrece video
  | 'puente' // 502 · el puente falló
  | 'sin_permiso' // 401 · 403 · 404
  | 'navegador' // sin RTCPeerConnection
  | 'cancelada' // 15-P · otra negociación, o el cambio de equipo, la abortó
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

export interface OpcionesDeNegociacion extends OpcionesDeIce {
  /** Se invoca cuando llega el flujo de video; el componente lo cuelga del `<video>`. */
  readonly alFlujo: (flujo: MediaStream) => void;
  /** Inyectable para las pruebas: por omisión, el `RTCPeerConnection` del navegador. */
  readonly crearConexion?: (configuracion: RTCConfiguration) => RTCPeerConnection;
  readonly fetchFn?: typeof fetch;
  /** Cuánto se espera a que el ICE local termine antes de mandar la oferta. */
  readonly plazoIceMs?: number;
  /**
   * D3 (15-L) · la conexión se cayó DESPUÉS de negociar (`failed` o
   * `disconnected`): sin esto el recuadro se quedaba en el último cuadro, o en
   * negro, diciendo «En vivo».
   */
  readonly alCortarse?: () => void;
  /** 15-P · 0.4 · quien la pidió ya no la quiere (cambió de equipo): se aborta. */
  readonly senal?: AbortSignal;
}

/**
 * 15-P · 0.4 · UNA SOLA NEGOCIACIÓN EN VUELO POR CONSOLA.
 *
 * Al cambiar de equipo, la negociación anterior seguía su curso —la oferta
 * viajaba, el puente abría una sesión— y sólo al terminar se cerraba. Con
 * cambios rápidos se acumulaban sesiones a medio abrir en el puente. Ahora la
 * nueva aborta la que esté en vuelo (su `fetch` y su `RTCPeerConnection`); las
 * sesiones YA establecidas no se tocan: las cierra su dueño.
 */
let enVuelo: AbortController | null = null;

export const rutaWhep = (copropiedadId: string, dispositivoId: string): string =>
  `/api/ncr/copropiedades/${encodeURIComponent(copropiedadId)}/guardia/video/${encodeURIComponent(dispositivoId)}/whep`;

/**
 * Otros fallos (15-M) · la API caída (502 del proxy, `api-inalcanzable`) o
 * arrancando (503 del puerto de arranque, `api-arrancando`) no es un fallo del
 * puente de video ni un puente sin desplegar: se dice que es la API.
 */
const CORRELACIONES_SIN_API: ReadonlySet<string> = new Set(['api-inalcanzable', 'api-arrancando']);

const codigoSegunEstado = (estado: number, correlacion: string | null): CodigoDeVistaEnVivo => {
  if (correlacion !== null && CORRELACIONES_SIN_API.has(correlacion)) return 'sin_api';
  if (estado === 503) return 'sin_puente';
  if (estado === 409) return 'sin_video';
  if (estado === 502) return 'puente';
  if (estado === 401 || estado === 403 || estado === 404) return 'sin_permiso';
  return 'red';
};

const cuerpoDelError = async (
  respuesta: Response,
): Promise<{ readonly mensaje: string; readonly correlacion: string | null }> => {
  const texto = await respuesta.text().catch(() => '');
  let correlacion: string | null = null;
  try {
    const cuerpo: unknown = JSON.parse(texto);
    if (typeof cuerpo === 'object' && cuerpo !== null) {
      const { mensaje, correlacion: c } = cuerpo as { mensaje?: unknown; correlacion?: unknown };
      if (typeof c === 'string') correlacion = c;
      if (typeof mensaje === 'string') return { mensaje, correlacion };
    }
  } catch {
    // no era JSON: se usa el texto tal cual
  }
  return {
    mensaje: texto === '' ? `HTTP ${String(respuesta.status)}` : texto.slice(0, 200),
    correlacion,
  };
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
  const propia = new AbortController();
  enVuelo?.abort();
  enVuelo = propia;
  if (opciones.senal?.aborted === true) propia.abort();
  opciones.senal?.addEventListener('abort', () => propia.abort(), { once: true });
  const conexion = crear({ iceServers: await iceDe(url, opciones) });
  propia.signal.addEventListener('abort', () => conexion.close(), { once: true });
  const exigirVigente = (): void => {
    if (propia.signal.aborted) {
      throw new ErrorDeVistaEnVivo(
        'cancelada',
        'La negociación se canceló: otro equipo en pantalla',
      );
    }
  };
  conexion.addEventListener('track', (evento) => {
    const [flujo] = evento.streams;
    if (flujo !== undefined) opciones.alFlujo(flujo);
  });
  conexion.addEventListener('connectionstatechange', () => {
    const estado = conexion.connectionState;
    if (estado === 'failed' || estado === 'disconnected') opciones.alCortarse?.();
  });
  try {
    conexion.addTransceiver('video', { direction: 'recvonly' });
    const oferta = await conexion.createOffer();
    await conexion.setLocalDescription(oferta);
    await esperarIce(conexion, opciones.plazoIceMs ?? 1500);
    const sdp = conexion.localDescription?.sdp ?? oferta.sdp ?? '';

    exigirVigente();
    const inicio = performance.now();
    const respuesta = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/sdp', accept: 'application/sdp' },
      body: sdp,
      cache: 'no-store',
      signal: propia.signal,
    });
    exigirVigente();
    if (!respuesta.ok) {
      const { mensaje, correlacion } = await cuerpoDelError(respuesta);
      throw new ErrorDeVistaEnVivo(codigoSegunEstado(respuesta.status, correlacion), mensaje);
    }
    const respuestaSdp = await respuesta.text();
    exigirVigente();
    await conexion.setRemoteDescription({ type: 'answer', sdp: respuestaSdp });
    return {
      latenciaNegociacionMs: Math.round(performance.now() - inicio),
      cerrar: () => conexion.close(),
    };
  } catch (error) {
    conexion.close();
    if (error instanceof ErrorDeVistaEnVivo) throw error;
    if (propia.signal.aborted) {
      throw new ErrorDeVistaEnVivo(
        'cancelada',
        'La negociación se canceló: otro equipo en pantalla',
      );
    }
    throw new ErrorDeVistaEnVivo('red', error instanceof Error ? error.message : String(error));
  } finally {
    if (enVuelo === propia) enVuelo = null;
  }
};

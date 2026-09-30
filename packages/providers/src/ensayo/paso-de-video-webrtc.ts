import { urlRtspDe } from '../hikvision/video-rtsp';
import { sinSecretos } from '../equipo/intercambio';
import { OFERTA_SDP_DE_SONDA } from './oferta-sdp-de-sonda';
import { resultado } from './tipos';
import type { OpcionesDeEnsayo, ResultadoDePaso } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E2/C1 (15-M) · PASO 7, SEGUNDA MITAD: WEBRTC DE VERDAD CONTRA EL PUENTE
 *
 * La sonda RTSP (`pasoDeVideo`) dice que el equipo describe H.264; en sitio el
 * 28/09 eso estaba en verde y la consola seguía sin video («HTTP 500 · EOF»):
 * lo que fallaba era el tramo puente → equipo. Con `GO2RTC_URL` en el `.env`,
 * este paso hace lo mismo que la API cuando la guardia pide ver el equipo:
 * registra el flujo con `PATCH` (en memoria, nada al fichero) y negocia una
 * oferta SDP por `POST /api/webrtc`. Si vuelve `v=0`, el camino completo
 * funciona y se mide cuánto tardó (KPI-33).
 *
 * NUNCA sale la fuente: la URL RTSP lleva la credencial (RN-21). Las causas
 * van en palabras y con remedio, como en la API.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CAUSAS: readonly { readonly patron: RegExp; readonly frase: string }[] = [
  {
    patron: /did not find expected key|yaml/i,
    frase: 'el puente rechazó el registro por un `streams:` sobrante en su fichero',
  },
  { patron: /\b412\b|Precondition/i, frase: 'el equipo no tiene ese canal de video' },
  // V5 (15-N) · go2rtc no dice el código: la sonda RTSP de este mismo paso sí.
  {
    patron: /wrong response on DESCRIBE/i,
    frase:
      'el equipo rechazó el flujo (canal, permiso de vista en vivo o sesiones: la sonda RTSP dice cuál)',
  },
  {
    patron: /\b401\b|Unauthorized|wrong user\/pass/i,
    frase:
      'el equipo rechazó la credencial por RTSP (si sólo ofrece Digest SHA-256, el puente no lo sabe: póngalo en MD5)',
  },
  {
    patron: /EOF|\b551\b|connection reset|broken pipe/i,
    frase: 'el equipo cerró la conexión de video (backchannel u otro rechazo del flujo)',
  },
  { patron: /i\/o timeout|dial tcp|no route/i, frase: 'el puente no llega al equipo por RTSP' },
];

const ACCION =
  'Pruebe otro canal en la ficha (la lista muestra los que declara el equipo), confirme el ' +
  'permiso de vista en vivo del usuario de servicio y reinicie `pnpm sitio:video`';

/** Texto del puente, sin credencial ni URL RTSP y acotado. */
const limpio = (texto: string): string =>
  sinSecretos(texto)
    .replace(/rtsps?:\/\/[^\s"'<>]+/gi, 'rtsp://[redactado]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);

const causaDe = (texto: string): string =>
  CAUSAS.find((c) => c.patron.test(texto))?.frase ?? 'el puente no pudo negociar el video';

export const pasoDeVideoWebrtc = async (
  o: OpcionesDeEnsayo,
  sonda: ResultadoDePaso,
  canalProbado: string | null = null,
): Promise<ResultadoDePaso> => {
  if (o.puente === undefined) {
    return {
      ...sonda,
      detalle: [...sonda.detalle, 'WebRTC no probado: sin GO2RTC_URL en apps/api/.env'],
    };
  }
  if (sonda.estado !== 'ok') {
    return { ...sonda, detalle: [...sonda.detalle, 'WebRTC no probado: la sonda RTSP ya falló'] };
  }
  const { equipo } = o;
  const canal = canalProbado ?? equipo.canalDeVideo;
  if (canal === null) {
    return { ...sonda, detalle: [...sonda.detalle, 'WebRTC no probado: no hay canal de video'] };
  }
  const base = o.puente.url.replace(/\/+$/, '');
  const fetchFn = o.puente.fetchFn ?? ((entrada, init) => fetch(entrada, init));
  const nombre = `ensayo-${equipo.familia}`;
  const src = urlRtspDe({
    host: equipo.host,
    puerto: equipo.puertoRtsp,
    usuario: equipo.usuario,
    clave: equipo.clave,
    canal,
  });
  const fallo = (causa: string, detalle: string): ResultadoDePaso =>
    resultado('video', 'fallo', `${sonda.causa}, pero ${causa}`, ACCION, [
      ...sonda.detalle,
      `puente: ${detalle}`,
    ]);
  try {
    const registro = await fetchFn(
      `${base}/api/streams?${new URLSearchParams({ name: nombre, src }).toString()}`,
      { method: 'PATCH', signal: AbortSignal.timeout(5000) },
    );
    if (!registro.ok) {
      const texto = limpio(await registro.text().catch(() => ''));
      return fallo(causaDe(texto), `registro HTTP ${String(registro.status)} · ${texto}`);
    }
    const inicio = Date.now();
    const negociacion = await fetchFn(
      `${base}/api/webrtc?${new URLSearchParams({ src: nombre }).toString()}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/sdp', accept: 'application/sdp' },
        body: OFERTA_SDP_DE_SONDA,
        signal: AbortSignal.timeout(15_000),
      },
    );
    const cuerpo = await negociacion.text().catch(() => '');
    const tardo = Date.now() - inicio;
    void fetchFn(`${base}/api/streams?${new URLSearchParams({ src: nombre }).toString()}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(2000),
    }).catch(() => undefined);
    if (!negociacion.ok || !cuerpo.startsWith('v=0')) {
      const texto = limpio(cuerpo);
      return fallo(
        causaDe(texto),
        `negociación HTTP ${String(negociacion.status)} · ${texto === '' ? 'sin SDP' : texto}`,
      );
    }
    return resultado(
      'video',
      'ok',
      `${sonda.causa}; WebRTC negociado con el puente en ${String(tardo)} ms`,
      null,
      [...sonda.detalle, `puente: SDP en ${String(tardo)} ms (meta < 2 s de KPI-33)`],
    );
  } catch (error) {
    const texto = limpio(error instanceof Error ? error.message : String(error));
    return resultado(
      'video',
      'fallo',
      `${sonda.causa}, pero el puente (go2rtc) no contesta en GO2RTC_URL`,
      'Arranque el puente en el Mac: `pnpm sitio:video`, y compruebe GO2RTC_URL en apps/api/.env',
      [...sonda.detalle, `puente: ${texto}`],
    );
  }
};

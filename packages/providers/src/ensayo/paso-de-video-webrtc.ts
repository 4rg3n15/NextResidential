import { urlRtspDe } from '../hikvision/video-rtsp';
import { sinSecretos } from '../equipo/intercambio';
import { REMEDIOS_DE_VIDEO, codecsDeLaOferta, decidirViaDeVideo } from '../nucleo/via-de-video';
import { PuenteDelEnsayo } from './negociacion-de-ensayo';
import { OFERTA_SDP_DE_SONDA, OFERTA_SDP_DE_SONDA_CON_H265 } from './oferta-sdp-de-sonda';
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
  // A3 (15-S2) · lo que go2rtc dice sin ffmpeg o con su RTSP interno apagado.
  {
    patron: /ffmpeg"?: executable file not found|fork\/exec [^:]*ffmpeg/i,
    frase: 'el puente no encuentra ffmpeg para transcodificar a H.264 (`brew install ffmpeg`)',
  },
  {
    patron: /rtsp module disabled/i,
    frase: 'el puente tiene apagado su RTSP interno: reinícielo con `pnpm sitio:video`',
  },
  {
    patron: /codecs not matched/i,
    frase: 'el navegador no acepta el códec del equipo y no se transcodificó',
  },
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

/**
 * A5 (15-S2) · el primer cuadro DESDE QUE SE PIDE —la SDP más lo que tarda el
 * primer fragmento con medios—, contra los 2 s de KPI-33. En el banco, tras la
 * SDP el cuadro llega en ≈45 ms porque el transcodificador ya está en marcha:
 * la espera está en la SDP, que go2rtc no contesta hasta conocer el códec que
 * le entrega ffmpeg.
 */
const fraseDelCuadro = (sdpMs: number, cuadroMs: number | null): string => {
  if (cuadroMs === null) return 'primer cuadro no medido (el puente no entregó medios en 10 s)';
  const total = sdpMs + cuadroMs;
  return (
    `primer cuadro a los ${String(total)} ms de pedirlo (SDP ${String(sdpMs)} + ` +
    `${String(cuadroMs)})${total > 2000 ? ', SOBRE la meta de 2 s de KPI-33' : ''}`
  );
};

export const pasoDeVideoWebrtc = async (
  o: OpcionesDeEnsayo,
  sonda: ResultadoDePaso,
  canalProbado: string | null = null,
  codecProbado: string | null = null,
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
  const fallo = (causa: string, detalle: string, accion = ACCION): ResultadoDePaso =>
    resultado('video', 'fallo', `${sonda.causa}, pero ${causa}`, accion, [
      ...sonda.detalle,
      `puente: ${detalle}`,
    ]);
  // A2 (15-S2) · la MISMA regla que la API, con la oferta de la sonda (H.264,
  // como Chrome): el peor caso de los dos navegadores.
  const via = decidirViaDeVideo(
    codecProbado,
    codecsDeLaOferta(OFERTA_SDP_DE_SONDA),
    o.puente.transcodificar !== 'nunca',
  );
  if (via.via === 'no_reproducible') {
    return fallo(via.motivo, 'sin vía de video para Chrome', REMEDIOS_DE_VIDEO);
  }
  const puente = new PuenteDelEnsayo(
    o.puente.url,
    o.puente.fetchFn ?? ((entrada, init) => fetch(entrada, init)),
  );
  const nombre = `ensayo-${equipo.familia}`;
  const derivado = `${nombre}-h264`;
  const src = urlRtspDe({
    host: equipo.host,
    puerto: equipo.puertoRtsp,
    usuario: equipo.usuario,
    clave: equipo.clave,
    canal,
  });
  try {
    const registros: readonly { readonly flujo: string; readonly fuente: string }[] = [
      { flujo: nombre, fuente: src },
      // A3 · la fuente transcodificada REFERENCIA el flujo por su nombre (RN-21).
      ...(via.via === 'directo'
        ? []
        : [{ flujo: derivado, fuente: `ffmpeg:${nombre}#video=h264` }]),
    ];
    for (const { flujo, fuente } of registros) {
      const registro = await puente.registrar(flujo, fuente);
      if (!registro.ok) {
        const texto = limpio(await registro.text().catch(() => ''));
        return fallo(causaDe(texto), `registro HTTP ${String(registro.status)} · ${texto}`);
      }
    }
    const usados = registros.map((r) => r.flujo);
    const negociado = via.via === 'directo' ? nombre : derivado;
    const n = await puente.negociar(negociado, OFERTA_SDP_DE_SONDA);
    if (n.estado < 200 || n.estado > 299 || !n.cuerpo.startsWith('v=0')) {
      puente.retirar(usados);
      const texto = limpio(n.cuerpo);
      return fallo(
        causaDe(texto),
        `negociación HTTP ${String(n.estado)} · ${texto === '' ? 'sin SDP' : texto}`,
      );
    }
    const cuadro = await puente.primerCuadro(negociado);
    // A5 · con H.265, también la vía de Safari: directa, sin transcodificar.
    const safari =
      codecProbado === 'H.265'
        ? await puente.negociar(nombre, OFERTA_SDP_DE_SONDA_CON_H265).catch(() => null)
        : null;
    puente.retirar(usados);
    const lineaSafari =
      safari === null
        ? []
        : [
            `puente: Safari (oferta con H.265) · ${
              safari.cuerpo.startsWith('v=0')
                ? `directo, SDP en ${String(safari.ms)} ms`
                : `HTTP ${String(safari.estado)} · ${limpio(safari.cuerpo)}`
            }`,
          ];
    return resultado(
      'video',
      'ok',
      `${sonda.causa}; WebRTC negociado con el puente en ${String(n.ms)} ms (${via.via}), ` +
        fraseDelCuadro(n.ms, cuadro),
      null,
      [
        ...sonda.detalle,
        `puente: Chrome (oferta H.264) · ${via.via}, SDP en ${String(n.ms)} ms, ` +
          `${fraseDelCuadro(n.ms, cuadro)} (meta < 2 s de KPI-33)`,
        ...lineaSafari,
      ],
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

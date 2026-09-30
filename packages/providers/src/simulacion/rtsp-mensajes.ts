import { createHash } from 'node:crypto';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * E2/C1 · LOS MENSAJES RTSP DEL EQUIPO SIMULADO, COMO FUNCIONES PURAS
 *
 * Lo que el servidor simulado (`servidor-rtsp.ts`) necesita para leer una
 * petición, contestarla y comprobar un Digest, sin sockets: se prueba solo y
 * deja al servidor con el bucle de conexión y las decisiones del guion.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface PeticionRtsp {
  readonly metodo: string;
  readonly uri: string;
  readonly cseq: string;
  /** Cabeceras en minúsculas. */
  readonly cabeceras: ReadonlyMap<string, string>;
}

export const REINO_RTSP = 'IP Camera(simulada)';

/** Cabecera con la que go2rtc pide el canal de retorno ONVIF en el DESCRIBE. */
export const REQUIRE_BACKCHANNEL = 'www.onvif.org/ver20/backchannel';

export const md5 = (t: string): string => createHash('md5').update(t, 'utf8').digest('hex');
const sha256 = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');

/** V3 (15-N) · los desafíos que el equipo simulado ofrece, en su orden. */
export type DesafioSimulado = 'md5' | 'sha256' | 'basic';

/** La cabecera de una petición RTSP (hasta la línea en blanco), ya separada. */
export const leerPeticion = (cabecera: string): PeticionRtsp | null => {
  const lineas = cabecera.split('\r\n');
  const [metodo, uri] = (lineas[0] ?? '').split(' ');
  if (metodo === undefined || metodo === '' || uri === undefined) return null;
  const cabeceras = new Map<string, string>();
  for (const linea of lineas.slice(1)) {
    const dos = linea.indexOf(':');
    if (dos <= 0) continue;
    cabeceras.set(linea.slice(0, dos).trim().toLowerCase(), linea.slice(dos + 1).trim());
  }
  return { metodo, uri, cseq: cabeceras.get('cseq') ?? '0', cabeceras };
};

export const respuestaRtsp = (
  cseq: string,
  estado: string,
  extra: readonly string[] = [],
  cuerpo = '',
): string =>
  [
    `RTSP/1.0 ${estado}`,
    `CSeq: ${cseq}`,
    ...extra,
    `Content-Length: ${String(Buffer.byteLength(cuerpo))}`,
    '',
    cuerpo,
  ].join('\r\n');

export const desafioDigest = (
  nonce: string,
  ofrecidos: readonly DesafioSimulado[] = ['md5', 'basic'],
): readonly string[] =>
  ofrecidos.map((o) =>
    o === 'basic'
      ? `WWW-Authenticate: Basic realm="${REINO_RTSP}"`
      : o === 'sha256'
        ? `WWW-Authenticate: Digest realm="${REINO_RTSP}", nonce="${nonce}", algorithm=SHA-256, stale="FALSE"`
        : `WWW-Authenticate: Digest realm="${REINO_RTSP}", nonce="${nonce}", stale="FALSE"`,
  );

/** ¿La cabecera `Authorization` lleva el Digest correcto para ESTE método? */
export const digestValido = (
  autorizacion: string,
  metodo: string,
  nonce: string,
  usuario: string,
  clave: string,
  ofrecidos: readonly DesafioSimulado[] = ['md5', 'basic'],
): boolean => {
  const campo = (n: string): string =>
    new RegExp(`${n}="?([^",]+)"?`, 'i').exec(autorizacion)?.[1] ?? '';
  // V3 (15-N) · el resumen del algoritmo que declara la respuesta (sin él, MD5),
  // y SÓLO si el equipo lo ofreció: uno en «SHA256» no acepta un MD5.
  const pideSha = /^SHA-?256$/i.test(campo('algorithm'));
  if (!ofrecidos.includes(pideSha ? 'sha256' : 'md5')) return false;
  const h = pideSha ? sha256 : md5;
  const ha1 = h(`${usuario}:${REINO_RTSP}:${clave}`);
  const esperado = h(`${ha1}:${nonce}:${h(`${metodo}:${campo('uri')}`)}`);
  return campo('username') === usuario && campo('response') === esperado;
};

/** El canal de `/Streaming/Channels/<canal>`, con o sin `/trackID=…` detrás. */
export const canalDeLaUri = (uri: string): string | null =>
  /\/Streaming\/Channels\/(\d+)(?:\/|$)/i.exec(uri)?.[1] ?? null;

/**
 * El SDP del flujo: video en el códec del guion y audio PCMU, con `control`
 * relativo por pista, como lo describen estos equipos. El perfil H.264 y el
 * modo de empaquetado van en el `fmtp` porque el puente los lee al ofrecer la
 * pista al navegador.
 */
export const sdpDe = (codec: string): string =>
  [
    'v=0',
    'o=- 1 1 IN IP4 0.0.0.0',
    's=Media Presentation',
    't=0 0',
    'a=control:*',
    'm=video 0 RTP/AVP 96',
    `a=rtpmap:96 ${codec}/90000`,
    ...(codec === 'H264' ? ['a=fmtp:96 packetization-mode=1;profile-level-id=42001F'] : []),
    'a=control:trackID=1',
    'm=audio 0 RTP/AVP 0',
    'a=rtpmap:0 PCMU/8000',
    'a=control:trackID=2',
    '',
  ].join('\r\n');

/** Ecoa el transporte pedido (canales entrelazados) o propone 0-1. */
export const transporteDeRespuesta = (pedido: string | undefined): string => {
  const entrelazado = /interleaved=(\d+-\d+)/i.exec(pedido ?? '')?.[1] ?? '0-1';
  return `RTP/AVP/TCP;unicast;interleaved=${entrelazado}`;
};

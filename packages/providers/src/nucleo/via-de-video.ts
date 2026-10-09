/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A2 (15-S2) · POR QUÉ VÍA SE SIRVE EL VIDEO DE UN EQUIPO
 *
 * Hasta la 15-S1 el proveedor negaba todo canal que no fuera H.264 ANTES de
 * llamar al puente (C.2). Medido con go2rtc v1.9.14 y una fuente H.265 real
 * (banco de la 15-S2): con una oferta que incluye H.265 —la de Safari— el
 * puente negocia directo (201, 115 ms); con la de Chrome, que no lo trae,
 * contesta 500 «codecs not matched». La negación anticipada cerraba la puerta
 * también a Safari: era una regresión.
 *
 * La decisión depende de tres cosas y de nada más, y por eso es una función
 * pura: el códec que entrega el equipo, los que el navegador acepta y si el
 * puente puede transcodificar. La usan la API (vista en vivo) y el paso 7 del
 * ensayo en sitio: la MISMA regla en los dos sitios.
 *
 *   códec del equipo   │ oferta                 │ transcodificación │ vía
 *   ───────────────────┼────────────────────────┼───────────────────┼──────────────────
 *   desconocido        │ cualquiera             │ cualquiera        │ directo (se intenta)
 *   X                  │ incluye X              │ cualquiera        │ directo
 *   H.265 (≠ H.264)    │ sin X, con H.264       │ sí                │ transcodificado
 *   H.265 (≠ H.264)    │ sin X, con H.264       │ no                │ no reproducible
 *   cualquiera         │ sin X y sin H.264      │ cualquiera        │ no reproducible
 *
 * Con el códec desconocido se intenta directo: negar por no saber dejaría sin
 * video a un equipo que funciona, y el puente, si falla, lo dice con su causa.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type ViaDeVideo =
  | { readonly via: 'directo' }
  | { readonly via: 'transcodificado' }
  | { readonly via: 'no_reproducible'; readonly motivo: string };

/** El nombre de cada códec de video en SDP (RFC 7798 usa H265; algún cliente, HEVC). */
const CODECS_SDP: readonly { readonly patron: RegExp; readonly codec: string }[] = [
  { patron: /^H264$/i, codec: 'H.264' },
  { patron: /^(?:H265|HEVC)$/i, codec: 'H.265' },
];

/** Los códecs de VIDEO que acepta una oferta SDP, en la forma del equipo («H.264», «H.265»). */
export const codecsDeLaOferta = (sdp: string): ReadonlySet<string> => {
  const secciones = sdp.split(/\r?\n(?=m=)/).filter((s) => s.startsWith('m=video'));
  const codecs = new Set<string>();
  for (const seccion of secciones) {
    for (const [, nombre] of seccion.matchAll(/^a=rtpmap:\d+ ([A-Za-z0-9-]+)\//gm)) {
      const conocido = CODECS_SDP.find((c) => c.patron.test(nombre ?? ''));
      if (conocido !== undefined) codecs.add(conocido.codec);
    }
  }
  return codecs;
};

/**
 * A4 (15-S2) · los tres remedios, en el orden en que se aplican en sitio: el
 * primero no toca nada, el segundo es del Mac y el tercero es del equipo y lo
 * autoriza el cliente (el sistema no cambia el códec por su cuenta).
 */
export const REMEDIOS_DE_VIDEO =
  'Para verlo: (1) abra la consola en Safari, que reproduce H.265; (2) instale ffmpeg en el ' +
  'Mac (`brew install ffmpeg`) con VIDEO_TRANSCODIFICAR=auto y reinicie `pnpm sitio:video`, y ' +
  'el puente lo transcodifica a H.264; o (3) cambie ese flujo a H.264 en el equipo, lo que ' +
  'requiere autorización del cliente.';

const noReproducible = (motivo: string): ViaDeVideo => ({ via: 'no_reproducible', motivo });

export const decidirViaDeVideo = (
  codecDelEquipo: string | null,
  oferta: ReadonlySet<string>,
  transcodificacion: boolean,
): ViaDeVideo => {
  if (codecDelEquipo === null || oferta.has(codecDelEquipo)) return { via: 'directo' };
  if (!oferta.has('H.264')) {
    return noReproducible(
      `el navegador no acepta ${codecDelEquipo} ni H.264, y el puente sólo transcodifica a H.264`,
    );
  }
  // Aquí el equipo no entrega H.264 (si lo entregara, la oferta lo traería):
  // transcodificar a H.264 es lo único que queda.
  return transcodificacion
    ? { via: 'transcodificado' }
    : noReproducible(
        `este navegador no reproduce ${codecDelEquipo} y el puente no transcodifica ` +
          '(VIDEO_TRANSCODIFICAR=nunca, sin ffmpeg o video servido por el Edge)',
      );
};

/**
 * La frase del operador cuando no hay vía: qué entrega el equipo, por qué no
 * se ve y qué hacer. Empieza por el verbo («entrega H.265…») porque la API la
 * pone detrás de «El equipo … no ofrece video:».
 */
export const fraseDeVideoNoReproducible = (
  codec: string,
  canal: string | null,
  motivo: string,
): string =>
  `entrega ${codec}${canal === null ? '' : ` en el canal ${canal}`}: ${motivo}. ` +
  REMEDIOS_DE_VIDEO;

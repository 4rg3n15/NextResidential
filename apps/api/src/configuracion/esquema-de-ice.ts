import { z } from 'zod';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · E2 · LOS SERVIDORES ICE QUE LA CONSOLA USA PARA EL VIDEO
 *
 * Con el Edge como puente, el go2rtc que sirve el video está en la red del
 * conjunto y la consola, fuera (o en otra red). Sin STUN el navegador no
 * conoce su dirección pública; detrás de NAT simétricos ni con STUN: hace
 * falta un TURN que retransmita. Las tres variables son OPCIONALES: sin
 * ninguna, la consola negocia con `iceServers: []`, exactamente como antes
 * (misma red del conjunto, R1).
 *
 *  · `WEBRTC_STUN_URLS` — `stun:` separadas por comas.
 *  · `WEBRTC_TURN_URLS` — `turn:` o `turns:` separadas por comas.
 *  · `WEBRTC_TURN_SECRETO` — el `static-auth-secret` del TURN (mecanismo REST
 *    de coturn). NUNCA viaja: la API entrega a cada usuario una credencial
 *    EFÍMERA (`<expira>:<usuario>` + HMAC-SHA1), que caduca sola.
 *  · `WEBRTC_TURN_TTL_SEGUNDOS` — la vida de esa credencial (sin ella, 10 min).
 *
 * Dónde se aloja el TURN: PENDIENTE DE DEFINICIÓN (registro de la 15-Q2).
 * ═════════════════════════════════════════════════════════════════════════════
 */
const listaDe = (nombre: string, esquema: RegExp, ejemplo: string) =>
  z
    .string()
    .trim()
    .transform((v) =>
      v
        .split(',')
        .map((u) => u.trim())
        .filter((u) => u.length > 0),
    )
    .refine((urls) => urls.length > 0 && urls.every((u) => esquema.test(u)), {
      message: `${nombre} admite URLs ${ejemplo} separadas por comas`,
    })
    .optional();

export const ESQUEMA_DE_ICE = {
  WEBRTC_STUN_URLS: listaDe('WEBRTC_STUN_URLS', /^stun:[^\s,]+$/, 'stun:host:puerto'),
  WEBRTC_TURN_URLS: listaDe('WEBRTC_TURN_URLS', /^turns?:[^\s,]+$/, 'turn: o turns:'),
  WEBRTC_TURN_SECRETO: z
    .string()
    .min(32, 'WEBRTC_TURN_SECRETO debe tener al menos 32 caracteres')
    // eslint-disable-next-line no-control-regex
    .refine((v) => !/[\s\u0000-\u001f\u007f]/.test(v), {
      message: 'WEBRTC_TURN_SECRETO contiene espacios o caracteres de control',
    })
    .optional(),
  WEBRTC_TURN_TTL_SEGUNDOS: z.coerce.number().int().min(60).max(86_400).optional(),
};

/** Un TURN sin su secreto daría credenciales que el TURN rechaza: no arranca. */
export const problemaDeIce = (c: {
  readonly WEBRTC_TURN_URLS?: readonly string[] | undefined;
  readonly WEBRTC_TURN_SECRETO?: string | undefined;
}): string | null => {
  const hayTurn = c.WEBRTC_TURN_URLS !== undefined;
  const haySecreto = c.WEBRTC_TURN_SECRETO !== undefined;
  if (hayTurn === haySecreto) return null;
  return hayTurn
    ? 'WEBRTC_TURN_URLS sin WEBRTC_TURN_SECRETO: el TURN rechazaría toda credencial'
    : 'WEBRTC_TURN_SECRETO sin WEBRTC_TURN_URLS: un secreto que nadie usa no se configura';
};

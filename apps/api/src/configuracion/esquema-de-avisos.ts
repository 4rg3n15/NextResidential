import { createECDH } from 'node:crypto';
import { z } from 'zod';

/** Los servicios de push de Chrome, Firefox, Safari y Edge (ver `comun/servicios-de-push.ts`). */
export const SERVICIOS_DE_PUSH_POR_OMISION: readonly string[] = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · B2 · LOS AVISOS AL RESIDENTE POR WEB PUSH (ADR-036, P-23)
 *
 *  · `WEB_PUSH_VAPID_PUBLICA` / `WEB_PUSH_VAPID_PRIVADA` — el par VAPID que
 *    genera `node scripts/generar-llaves-vapid.mjs`. La PRIVADA es secreto:
 *    sólo en el entorno de la API (Secret Manager en Cloud Run), nunca en el
 *    repositorio ni en la consola. La pública no es secreta y la consola la
 *    recibe de la API (`GET …/mi/notificaciones/web-push`), no de un
 *    `NEXT_PUBLIC_*`.
 *  · `WEB_PUSH_SUJETO` — `mailto:` o `https:` de contacto para los servicios.
 *  · `WEB_PUSH_SERVICIOS_PERMITIDOS` — hosts admitidos como endpoint (SSRF);
 *    sin ella, los de los cuatro navegadores.
 *  · `WEB_PUSH_TTL_SEGUNDOS` — cuánto guarda el servicio un aviso para un
 *    aparato apagado (15 min por omisión [SUPUESTO] S-15R-01: un «su visita
 *    está en la portería» de hace una hora ya no sirve).
 *
 * Las tres primeras van juntas o no va ninguna. Sin ellas la API ARRANCA
 * —desarrollo y CI son despliegues legítimos sin avisos— y lo dice al
 * arrancar: el notificador devuelve 0, nunca un éxito fingido.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const base64url = (nombre: string) =>
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]+$/, `${nombre} debe ir en base64url, sin relleno`)
    .optional();

/** [SUPUESTO] S-15R-01 · 15 min. */
export const TTL_POR_OMISION = 900;

export const ESQUEMA_DE_AVISOS = {
  WEB_PUSH_VAPID_PUBLICA: base64url('WEB_PUSH_VAPID_PUBLICA'),
  WEB_PUSH_VAPID_PRIVADA: base64url('WEB_PUSH_VAPID_PRIVADA'),
  WEB_PUSH_SUJETO: z
    .string()
    .trim()
    .regex(/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/, 'WEB_PUSH_SUJETO es mailto: o https:')
    .optional(),
  WEB_PUSH_SERVICIOS_PERMITIDOS: z
    .string()
    .trim()
    .transform((v) =>
      v
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter((h) => h.length > 0),
    )
    .refine((hosts) => hosts.length > 0 && hosts.every((h) => /^[a-z0-9.[\]:-]+$/.test(h)), {
      message: 'WEB_PUSH_SERVICIOS_PERMITIDOS admite hosts separados por comas',
    })
    .optional(),
  // Sin valor por omisión en el esquema: la composición pone los suyos
  // (`SERVICIOS_DE_PUSH_POR_OMISION`, `TTL_POR_OMISION`) y los dice al arrancar.
  WEB_PUSH_TTL_SEGUNDOS: z.coerce.number().int().min(0).max(86_400).optional(),
};

/**
 * El escalar privado en 32 bytes. Hay generadores (el propio `ECDH` de Node,
 * ~4 de cada 1000) que omiten un cero a la izquierda y dan 31: es la misma
 * llave, y se rellena en vez de rechazarla al azar.
 */
export const escalarDe32 = (privada: string): Buffer => {
  const cruda = Buffer.from(privada, 'base64url');
  return cruda.length >= 32 ? cruda : Buffer.concat([Buffer.alloc(32 - cruda.length), cruda]);
};

/** Lo que debe cumplir el par antes de usarse. `null` si está bien. */
export const problemaDelParVapid = (publica: string, privada: string): string | null => {
  const crudaPublica = Buffer.from(publica, 'base64url');
  const crudaPrivada = escalarDe32(privada);
  if (crudaPublica.length !== 65 || crudaPublica[0] !== 0x04) {
    return 'WEB_PUSH_VAPID_PUBLICA no es un punto P-256 sin comprimir en base64url (65 bytes)';
  }
  if (crudaPrivada.length !== 32 || Buffer.from(privada, 'base64url').length < 30) {
    return 'WEB_PUSH_VAPID_PRIVADA no son 32 bytes en base64url';
  }
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(crudaPrivada);
    if (!ecdh.getPublicKey().equals(crudaPublica)) {
      return 'WEB_PUSH_VAPID_PUBLICA no corresponde a WEB_PUSH_VAPID_PRIVADA';
    }
  } catch {
    return 'WEB_PUSH_VAPID_PRIVADA no es un escalar P-256 válido';
  }
  return null;
};

export const problemaDeAvisos = (c: {
  readonly WEB_PUSH_VAPID_PUBLICA?: string | undefined;
  readonly WEB_PUSH_VAPID_PRIVADA?: string | undefined;
  readonly WEB_PUSH_SUJETO?: string | undefined;
}): string | null => {
  const presentes = [c.WEB_PUSH_VAPID_PUBLICA, c.WEB_PUSH_VAPID_PRIVADA, c.WEB_PUSH_SUJETO].filter(
    (v) => v !== undefined,
  ).length;
  if (presentes === 0) return null;
  if (presentes !== 3) {
    return 'WEB_PUSH_VAPID_PUBLICA, WEB_PUSH_VAPID_PRIVADA y WEB_PUSH_SUJETO van las tres o ninguna';
  }
  return problemaDelParVapid(c.WEB_PUSH_VAPID_PUBLICA ?? '', c.WEB_PUSH_VAPID_PRIVADA ?? '');
};

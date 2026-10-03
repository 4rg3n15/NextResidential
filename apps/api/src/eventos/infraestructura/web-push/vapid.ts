import { createPrivateKey, sign } from 'node:crypto';
import { escalarDe32, problemaDelParVapid } from '../../../configuracion/esquema-de-avisos';
import type { KeyObject } from 'node:crypto';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA IDENTIDAD DEL SERVIDOR ANTE LOS SERVICIOS DE PUSH · VAPID (RFC 8292)
 *
 * Sin cuenta en ningún proveedor: el par de llaves P-256 lo genera Grupo
 * Control (`scripts/generar-llaves-vapid.mjs`) y es TODA la credencial. El
 * navegador se suscribe con la pública; cada envío lleva un JWT ES256 firmado
 * con la privada, con la audiencia del servicio de push, una caducidad corta y
 * un contacto (`sub`). Un servicio de push rechaza un envío a una suscripción
 * hecha con otra llave pública: robar el endpoint no basta para enviar.
 *
 * La privada vive SÓLO en el entorno de la API. La pública se valida contra
 * la privada al arrancar: un par cruzado no arranca, en vez de enviar avisos
 * que todos los servicios rechazarían con 403.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface LlavesVapid {
  /** Base64url de los 65 bytes del punto P-256 sin comprimir. */
  readonly publica: string;
  /** Base64url de los 32 bytes del escalar privado. */
  readonly privada: string;
  /** `mailto:` o `https:`: a quién escribe el servicio de push si algo falla. */
  readonly sujeto: string;
}

/** 12 h: la RFC 8292 admite hasta 24 h; menos vida, menos valor si se filtra. */
const VIDA_DEL_JWT_SEGUNDOS = 12 * 60 * 60;

const b64url = (b: Buffer | string): string => Buffer.from(b).toString('base64url');

export class FirmaVapid {
  private readonly llave: KeyObject;

  constructor(private readonly llaves: LlavesVapid) {
    const problema = problemaDelParVapid(llaves.publica, llaves.privada);
    if (problema !== null) throw new Error(problema);
    const publica = Buffer.from(llaves.publica, 'base64url');
    this.llave = createPrivateKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        d: b64url(escalarDe32(llaves.privada)),
        x: b64url(publica.subarray(1, 33)),
        y: b64url(publica.subarray(33, 65)),
      },
      format: 'jwk',
    });
  }

  /** `Authorization: vapid t=<jwt>, k=<pública>` para el servicio del endpoint. */
  cabecera(endpoint: string, ahora: Date): string {
    const encabezado = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const reclamos = b64url(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(ahora.getTime() / 1000) + VIDA_DEL_JWT_SEGUNDOS,
        sub: this.llaves.sujeto,
      }),
    );
    const firmado = `${encabezado}.${reclamos}`;
    const firma = sign('sha256', Buffer.from(firmado), {
      key: this.llave,
      dsaEncoding: 'ieee-p1363',
    });
    return `vapid t=${firmado}.${b64url(firma)}, k=${this.llaves.publica}`;
  }
}

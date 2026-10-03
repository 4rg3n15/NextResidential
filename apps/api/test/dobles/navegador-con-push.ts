import { createDecipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';
import type { ECDH } from 'node:crypto';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-R · B6 · EL NAVEGADOR SUSCRITO, DEL LADO QUE RECIBE
 *
 * Genera las llaves que generaría `PushManager.subscribe` (P-256 + 16 bytes de
 * `auth`) y DESCIFRA lo que le llega, como haría el navegador. El descifrado
 * está escrito desde el lado del receptor de la RFC 8291 y se valida él mismo
 * contra el ejemplo del apéndice A (`cifrado.test.ts`): así la prueba del
 * emisor no se apoya en la misma derivación que prueba.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface NavegadorConPush {
  readonly ecdh: ECDH;
  readonly auth: Buffer;
  readonly p256dh: string;
  readonly authB64: string;
}

export const navegadorNuevo = (): NavegadorConPush => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    auth,
    p256dh: ecdh.getPublicKey().toString('base64url'),
    authB64: auth.toString('base64url'),
  };
};

const hkdf = (ikm: Buffer, sal: Buffer, info: Buffer, largo: number): Buffer =>
  Buffer.from(hkdfSync('sha256', ikm, sal, info, largo));

/** RFC 8188 + 8291, lado del agente de usuario. Lanza si la etiqueta GCM no cuadra. */
export const descifrarComoNavegador = (
  receptor: { readonly ecdh: ECDH; readonly auth: Buffer },
  cuerpo: Buffer,
): Buffer => {
  const sal = cuerpo.subarray(0, 16);
  const largoDeLlave = cuerpo.readUInt8(20);
  const publicaDelServidor = cuerpo.subarray(21, 21 + largoDeLlave);
  const cifrado = cuerpo.subarray(21 + largoDeLlave);

  const secreto = receptor.ecdh.computeSecret(publicaDelServidor);
  const info = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    receptor.ecdh.getPublicKey(),
    publicaDelServidor,
  ]);
  const ikm = hkdf(secreto, receptor.auth, info, 32);
  const cek = hkdf(ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12);

  const descifrador = createDecipheriv('aes-128-gcm', cek, nonce);
  descifrador.setAuthTag(cifrado.subarray(cifrado.length - 16));
  const claro = Buffer.concat([
    descifrador.update(cifrado.subarray(0, cifrado.length - 16)),
    descifrador.final(),
  ]);
  // Último registro: el delimitador 0x02 y, antes, relleno de ceros opcional.
  let fin = claro.length - 1;
  while (fin >= 0 && claro[fin] === 0x00) fin -= 1;
  if (claro[fin] !== 0x02) throw new Error('falta el delimitador del último registro');
  return claro.subarray(0, fin);
};

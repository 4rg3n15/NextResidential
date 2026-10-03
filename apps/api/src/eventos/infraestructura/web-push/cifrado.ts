import { createCipheriv, createECDH, hkdfSync, randomBytes } from 'node:crypto';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL CONTENIDO DE UN AVISO, CIFRADO PARA UN SOLO NAVEGADOR · RFC 8291 + RFC 8188
 *
 * El servicio de push del navegador (el de Google para Chrome, el de Apple
 * para Safari, el de Mozilla para Firefox) TRANSPORTA el aviso y no puede
 * leerlo: va cifrado con una llave que sólo conoce el navegador suscrito
 * (`p256dh`, ECDH P-256) y un secreto compartido con él (`auth`). Es lo que
 * permite mandar «su visita llegó a la portería» sin que un tercero lo lea.
 *
 * Una llave efímera por mensaje (ECDH) y una sal aleatoria de 16 bytes: dos
 * avisos idénticos producen cifrados distintos. Un solo registro (`rs` 4096),
 * que es lo que admiten los servicios de push; el contenido se acota antes.
 *
 * Probado contra el ejemplo del apéndice A de la RFC 8291 byte a byte, y
 * descifrado por una implementación independiente (`http_ece`) en la prueba
 * del servicio de push falso.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface DestinoCifrado {
  /** Llave pública del navegador: punto P-256 sin comprimir (65 bytes). */
  readonly p256dh: Buffer;
  /** Secreto de autenticación del navegador (16 bytes). */
  readonly auth: Buffer;
}

/** Sólo para la prueba del apéndice A: en producción ambas son aleatorias. */
export interface EfimeraFija {
  readonly privada: Buffer;
  readonly sal: Buffer;
}

const TAMANO_DE_REGISTRO = 4096;
/** 16 sal + 4 rs + 1 longitud + 65 llave + 16 etiqueta GCM + 1 delimitador. */
export const SOBRECARGA_DEL_CIFRADO = 103;

const hkdf = (ikm: Buffer, sal: Buffer, info: Buffer, largo: number): Buffer =>
  Buffer.from(hkdfSync('sha256', ikm, sal, info, largo));

export const cifrarParaElNavegador = (
  destino: DestinoCifrado,
  contenido: Buffer,
  fija?: EfimeraFija,
): Buffer => {
  if (destino.p256dh.length !== 65 || destino.p256dh[0] !== 0x04) {
    throw new Error('p256dh no es un punto P-256 sin comprimir');
  }
  if (destino.auth.length !== 16) throw new Error('auth debe tener 16 bytes');
  if (contenido.length + SOBRECARGA_DEL_CIFRADO > TAMANO_DE_REGISTRO) {
    throw new Error('el aviso no cabe en un registro de 4096 bytes');
  }

  const efimera = createECDH('prime256v1');
  if (fija === undefined) efimera.generateKeys();
  else efimera.setPrivateKey(fija.privada);
  const publicaEfimera = efimera.getPublicKey();
  const sal = fija?.sal ?? randomBytes(16);

  // RFC 8291 §3.4: la IKM ata el secreto ECDH a las DOS llaves públicas y al
  // secreto `auth`; sin `auth` correcto, nadie deriva la llave del contenido.
  const secretoEcdh = efimera.computeSecret(destino.p256dh);
  const infoDeLlave = Buffer.concat([
    Buffer.from('WebPush: info\0'),
    destino.p256dh,
    publicaEfimera,
  ]);
  const ikm = hkdf(secretoEcdh, destino.auth, infoDeLlave, 32);
  const cek = hkdf(ikm, sal, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(ikm, sal, Buffer.from('Content-Encoding: nonce\0'), 12);

  const cifrador = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02: delimitador del ÚLTIMO registro (RFC 8188 §2), sin relleno.
  const cifrado = Buffer.concat([
    cifrador.update(Buffer.concat([contenido, Buffer.from([0x02])])),
    cifrador.final(),
    cifrador.getAuthTag(),
  ]);

  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(TAMANO_DE_REGISTRO);
  return Buffer.concat([sal, rs, Buffer.from([publicaEfimera.length]), publicaEfimera, cifrado]);
};

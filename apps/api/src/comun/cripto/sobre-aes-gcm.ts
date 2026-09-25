import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * EL SOBRE. Una sola forma de cifrar en todo el proyecto.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ SE EXTRAE (ETAPA 15-B · A.1)
 *
 * Las plantillas biométricas ya se guardaban así: AES-256-GCM con la llave
 * derivada por copropiedad con HKDF (H-13-02). Al llegar el secreto de los
 * equipos hacía falta cifrar una segunda cosa, y la tentación evidente era
 * escribir un segundo cifrado «parecido». Dos cifrados son dos superficies que
 * auditar, dos sitios donde equivocarse con el IV y dos respuestas distintas a
 * «¿y si rota la llave?». Aquí hay uno, y los dos usos lo comparten.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS DECISIONES QUE VIENEN CON ÉL, Y SIGUEN VIGENTES
 *
 *  · **GCM y no CBC.** El vector cifrado necesita ser AUTENTICADO. Sin etiqueta
 *    de integridad, quien tenga escritura en la base podría sustituir el
 *    contenido y el consumidor lo aceptaría sin pestañear: el cifrado
 *    protegería la confidencialidad y no la identidad, que en control de acceso
 *    es justo lo que hay que proteger.
 *  · **Cifrado en la APLICACIÓN, no con `pgcrypto`** (D-10). Si la llave vive
 *    en la base, quien lee la base lee la llave, y el cifrado deja de proteger
 *    de la fuga que importa: el volcado.
 *  · **HKDF y no PBKDF2/scrypt/argon2.** Esas tres son KDF con factor de
 *    trabajo, para secretos de BAJA entropía (contraseñas humanas). Aquí la
 *    entrada es un secreto de entorno de 32 caracteres o más: no hay fuerza
 *    bruta que encarecer y el factor de trabajo solo añadiría latencia.
 *  · **La sal es el identificador de la copropiedad**, y no necesita ser
 *    secreta: en HKDF aporta separación entre derivaciones, no secreto.
 *    Comprometer la llave de un tenant no descifra la de otro — el aislamiento
 *    entre copropiedades es el riesgo número uno declarado (§2.7.6).
 *  · **El `info` ata la llave a SU propósito.** La misma maestra no produce la
 *    misma llave para plantillas y para credenciales de equipo. Es lo que hace
 *    que compartir el código no signifique compartir la llave.
 */

export const ALGORITMO = 'aes-256-gcm';
export const LONGITUD_IV = 12;
export const LONGITUD_ETIQUETA = 16;

/** Propósitos conocidos. Enumerados para que nadie invente un `info` a mano. */
export const PROPOSITOS = {
  plantillas: 'ncr:plantillas-biometricas:v1',
  credencialesDeEquipo: 'ncr:credenciales-de-equipo:v1',
  /** A3 (15-E) · firma HMAC del enlace con el que el TITULAR responde. */
  enlaceDeConsentimiento: 'ncr:enlace-de-consentimiento:v1',
} as const;

export type Proposito = (typeof PROPOSITOS)[keyof typeof PROPOSITOS];

/** La llave de ESA copropiedad para ESE propósito. Nunca la maestra. */
export const derivarLlave = (
  maestra: string,
  copropiedadId: string,
  proposito: Proposito,
): Buffer => Buffer.from(hkdfSync('sha256', maestra, copropiedadId, proposito, 32));

/** Las tres piezas del sobre, tal como se guardan. */
export interface SobreCifrado {
  readonly iv: Buffer;
  readonly etiqueta: Buffer;
  readonly cuerpo: Buffer;
}

export const cifrar = (llave: Buffer, claro: Buffer): SobreCifrado => {
  if (claro.length === 0) {
    throw new Error('No se cifra un valor vacío: sería un vacío cifrado, no un secreto');
  }
  const iv = randomBytes(LONGITUD_IV);
  const cifrador = createCipheriv(ALGORITMO, llave, iv);
  const cuerpo = Buffer.concat([cifrador.update(claro), cifrador.final()]);
  return { iv, etiqueta: cifrador.getAuthTag(), cuerpo };
};

/**
 * `final()` lanza si la etiqueta no cuadra. Es lo que convierte «alguien tocó
 * la base» en un fallo ruidoso en vez de en un secreto distinto del que se
 * guardó.
 */
export const descifrar = (llave: Buffer, sobre: SobreCifrado): Buffer => {
  const descifrador = createDecipheriv(ALGORITMO, llave, sobre.iv);
  descifrador.setAuthTag(sobre.etiqueta);
  return Buffer.concat([descifrador.update(sobre.cuerpo), descifrador.final()]);
};

/** `iv ‖ etiqueta ‖ cuerpo`, para quien guarda el sobre como un solo blob. */
export const aplanar = (sobre: SobreCifrado): Buffer =>
  Buffer.concat([sobre.iv, sobre.etiqueta, sobre.cuerpo]);

export const desaplanar = (plano: Buffer): SobreCifrado => ({
  iv: plano.subarray(0, LONGITUD_IV),
  etiqueta: plano.subarray(LONGITUD_IV, LONGITUD_IV + LONGITUD_ETIQUETA),
  cuerpo: plano.subarray(LONGITUD_IV + LONGITUD_ETIQUETA),
});

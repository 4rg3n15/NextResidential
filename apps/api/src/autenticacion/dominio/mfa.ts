import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Segundo factor TOTP (RN-20, CA-25).
 *
 * Los códigos de recuperación se guardan **en hash**, igual que una contraseña:
 * si la base se filtrara, un código en claro sería una llave de entrada
 * permanente que además salta el segundo factor. Se comparan en tiempo
 * constante para no filtrar por medición cuántos caracteres coincidían.
 */
export interface CodigoDeRecuperacion {
  readonly hash: string;
  usado: boolean;
}

const hashear = (codigo: string): string =>
  createHash('sha256').update(codigo.trim().toUpperCase()).digest('hex');

export const generarCodigosDeRecuperacion = (
  cantidad = 10,
  aleatorio: (n: number) => Buffer = randomBytes,
): { codigosEnClaro: string[]; almacenables: CodigoDeRecuperacion[] } => {
  const codigosEnClaro = Array.from({ length: cantidad }, () =>
    aleatorio(5)
      .toString('hex')
      .toUpperCase()
      .match(/.{1,5}/g)!
      .join('-'),
  );
  return {
    codigosEnClaro,
    almacenables: codigosEnClaro.map((c) => ({ hash: hashear(c), usado: false })),
  };
};

/**
 * Consume un código. De un solo uso: se marca gastado ANTES de devolver éxito,
 * para que un reintento del mismo código no valga dos veces.
 */
export const consumirCodigoDeRecuperacion = (
  almacenados: CodigoDeRecuperacion[],
  candidato: string,
): boolean => {
  const objetivo = Buffer.from(hashear(candidato), 'hex');
  for (const guardado of almacenados) {
    if (guardado.usado) continue;
    const actual = Buffer.from(guardado.hash, 'hex');
    if (actual.length === objetivo.length && timingSafeEqual(actual, objetivo)) {
      guardado.usado = true;
      return true;
    }
  }
  return false;
};

export interface InscripcionMfa {
  readonly usuarioId: string;
  readonly secreto: string;
  readonly uriOtpauth: string;
  verificada: boolean;
  codigos: CodigoDeRecuperacion[];
}

import { createHash, randomBytes } from 'node:crypto';

/**
 * Autenticación **Digest MD5**, escrita aquí y sin dependencias nuevas.
 *
 * El equipo la exige: medido el 15/09/2026 contra el aparato instalado. No hay
 * biblioteca que traer —son dos funciones de resumen y una cabecera— y traerla
 * significaría una dependencia de ejecución más en la superficie que habla con
 * el hardware, que es justo donde menos conviene tener código ajeno.
 *
 * **El ciclo es de dos viajes, y el segundo se ahorra.** La primera petición va
 * sin credenciales, el equipo responde `401` con su desafío, y la segunda lo
 * responde. A partir de ahí el desafío se **reutiliza** con el contador `nc`
 * incrementado, que es lo que el protocolo prevé y lo que evita duplicar cada
 * orden. Cuando el equipo decide que el desafío caducó vuelve a contestar
 * `401`, y entonces se renegocia con el nuevo: por eso la renegociación tardía
 * tiene su propia prueba.
 *
 * Reutilizar el desafío no es una optimización cosmética. Cada `401` extra es
 * un intento fallido de autenticación desde el punto de vista del equipo, y
 * estos aparatos **bloquean la cuenta** tras unos pocos.
 */
export interface DesafioDigest {
  readonly realm: string;
  readonly nonce: string;
  readonly qop: string | null;
  readonly opaque: string | null;
  readonly algorithm: string;
}

const md5 = (texto: string): string => createHash('md5').update(texto, 'utf8').digest('hex');

/**
 * Lee la cabecera del desafío.
 *
 * Acepta valores entre comillas y sin ellas —el firmware no es consistente— y
 * no da por hecho el orden de los parámetros.
 */
export const interpretarDesafio = (cabecera: string | null): DesafioDigest | null => {
  if (cabecera === null) return null;
  const sinEsquema = /^\s*digest\s+(.*)$/is.exec(cabecera);
  if (sinEsquema === null) return null;

  const parametros = new Map<string, string>();
  const expresion = /([a-z0-9_-]+)\s*=\s*(?:"([^"]*)"|([^,\s]+))/gi;
  let encontrado = expresion.exec(sinEsquema[1]!);
  while (encontrado !== null) {
    parametros.set(encontrado[1]!.toLowerCase(), encontrado[2] ?? encontrado[3] ?? '');
    encontrado = expresion.exec(sinEsquema[1]!);
  }

  const realm = parametros.get('realm');
  const nonce = parametros.get('nonce');
  if (realm === undefined || nonce === undefined) return null;

  // `qop` puede venir como lista: `auth,auth-int`. Solo se admite `auth`; con
  // `auth-int` habría que resumir el cuerpo, y este equipo no lo pide.
  const qopCrudo = parametros.get('qop');
  const qop =
    qopCrudo === undefined
      ? null
      : (qopCrudo
          .split(',')
          .map((q) => q.trim().toLowerCase())
          .find((q) => q === 'auth') ?? null);

  return {
    realm,
    nonce,
    qop,
    opaque: parametros.get('opaque') ?? null,
    algorithm: (parametros.get('algorithm') ?? 'MD5').toUpperCase(),
  };
};

export interface CredencialesDigest {
  readonly usuario: string;
  readonly clave: string;
}

/**
 * Cabecera `Authorization` para una petición concreta.
 *
 * Se comprueba contra el vector de ejemplo de la RFC 2617 en las pruebas: es la
 * única forma de saber que el cálculo es correcto sin un equipo delante.
 */
export const construirAutorizacion = (
  desafio: DesafioDigest,
  credenciales: CredencialesDigest,
  metodo: string,
  uri: string,
  contador: number,
  cnonce: string,
): string => {
  const ha1 = md5(`${credenciales.usuario}:${desafio.realm}:${credenciales.clave}`);
  const ha2 = md5(`${metodo}:${uri}`);
  const nc = contador.toString(16).padStart(8, '0');

  const respuesta =
    desafio.qop === null
      ? md5(`${ha1}:${desafio.nonce}:${ha2}`)
      : md5(`${ha1}:${desafio.nonce}:${nc}:${cnonce}:${desafio.qop}:${ha2}`);

  const partes = [
    `username="${credenciales.usuario}"`,
    `realm="${desafio.realm}"`,
    `nonce="${desafio.nonce}"`,
    `uri="${uri}"`,
    `algorithm=${desafio.algorithm}`,
    `response="${respuesta}"`,
  ];
  if (desafio.qop !== null) partes.push(`qop=${desafio.qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (desafio.opaque !== null) partes.push(`opaque="${desafio.opaque}"`);

  return `Digest ${partes.join(', ')}`;
};

export const cnonceAleatorio = (): string => randomBytes(8).toString('hex');

/**
 * Cliente con estado: recuerda el desafío entre órdenes y lleva el contador.
 *
 * **No reintenta más de una vez.** Ante un `401` renegocia y repite; si el
 * segundo también es `401`, se rinde. Un bucle de reintentos contra un equipo
 * que bloquea cuentas por intentos fallidos es la forma más rápida de quedarse
 * fuera del aparato, y ya está anotado como riesgo en la guía de validación.
 */
export class SesionDigest {
  private desafio: DesafioDigest | null = null;
  private contador = 0;

  constructor(
    private readonly credenciales: CredencialesDigest,
    private readonly generarCnonce: () => string = cnonceAleatorio,
  ) {}

  /** Cabecera para la siguiente petición, o `null` si aún no hay desafío. */
  autorizacionPara(metodo: string, uri: string): string | null {
    if (this.desafio === null) return null;
    this.contador += 1;
    return construirAutorizacion(
      this.desafio,
      this.credenciales,
      metodo,
      uri,
      this.contador,
      this.generarCnonce(),
    );
  }

  /** Guarda el desafío recibido en un `401` y reinicia el contador. */
  aceptarDesafio(cabecera: string | null): boolean {
    const nuevo = interpretarDesafio(cabecera);
    if (nuevo === null) return false;
    this.desafio = nuevo;
    this.contador = 0;
    return true;
  }

  /** Para las pruebas y el diagnóstico: cuántas órdenes lleva este desafío. */
  get ordenesConEsteDesafio(): number {
    return this.contador;
  }
}

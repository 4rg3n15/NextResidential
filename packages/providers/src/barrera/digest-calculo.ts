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
  /**
   * H-SITIO-12 · `stale="TRUE"`: el equipo aceptó el resumen pero el nonce
   * ya había vencido. NO es una clave errónea, y confundirlas fue lo que en
   * sitio convirtió la segunda orden de cada equipo en «usuario o clave».
   */
  readonly stale: boolean;
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
  /**
   * H-SITIO-12 · `fetch` UNE las cabeceras repetidas con «, »: un equipo que
   * ofrece `Basic` y `Digest` llega como `Basic realm="x", Digest realm="y"…`.
   * Se busca el esquema Digest donde esté y se corta en el siguiente esquema,
   * para que un `realm` ajeno no pise el del desafío.
   */
  const inicio = /(?:^|,)\s*digest\s+/i.exec(cabecera);
  if (inicio === null) return null;
  const resto = cabecera.slice(inicio.index + inicio[0].length);
  const otroEsquema = /,\s*(?:basic|bearer|negotiate|ntlm)\b/i.exec(resto);
  const propios = otroEsquema === null ? resto : resto.slice(0, otroEsquema.index);

  const parametros = new Map<string, string>();
  const expresion = /([a-z0-9_-]+)\s*=\s*(?:"([^"]*)"|([^,\s]+))/gi;
  let encontrado = expresion.exec(propios);
  while (encontrado !== null) {
    parametros.set(encontrado[1]!.toLowerCase(), encontrado[2] ?? encontrado[3] ?? '');
    encontrado = expresion.exec(propios);
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
    stale: (parametros.get('stale') ?? '').toLowerCase() === 'true',
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

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

/**
 * Qué pasó al recibir un desafío nuevo. Lo necesita quien decide si reintentar
 * y cómo contarlo en la bitácora.
 */
export interface Renegociacion {
  /** `true` si el equipo marcó el nonce anterior como vencido (`stale`). */
  readonly vencido: boolean;
  /** `true` si el nonce cambió; `false` si el equipo repitió el mismo. */
  readonly nonceNuevo: boolean;
  /** `true` si todavía no había ningún desafío: el primer contacto. */
  readonly primerContacto: boolean;
}

/**
 * Cliente con estado: recuerda el desafío entre órdenes y lleva el contador.
 *
 * **No reintenta más de una vez.** Ante un `401` renegocia y repite; si el
 * segundo también es `401`, se rinde. Un bucle de reintentos contra un equipo
 * que bloquea cuentas por intentos fallidos es la forma más rápida de quedarse
 * fuera del aparato, y ya está anotado como riesgo en la guía de validación.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-12 · EL CONTADOR NO SE REINICIA SI EL NONCE ES EL MISMO
 *
 * `nc` es por nonce y el equipo rechaza uno repetido. Antes, cualquier `401`
 * ponía el contador a cero aunque el equipo devolviera el MISMO nonce: el
 * reintento viajaba con `nc=00000001` ya usado y el equipo lo rechazaba otra
 * vez. Dos `401` seguidos se leían como credencial, y la segunda orden de cada
 * equipo acababa en «usuario o clave» (sitio, 26/09/2026).
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

  /**
   * Guarda el desafío recibido en un `401`. Reinicia el contador SÓLO si el
   * nonce cambió. `null` si la cabecera no trae un desafío Digest legible.
   */
  renegociar(cabecera: string | null): Renegociacion | null {
    const nuevo = interpretarDesafio(cabecera);
    if (nuevo === null) return null;
    const primerContacto = this.desafio === null;
    const nonceNuevo = this.desafio?.nonce !== nuevo.nonce;
    this.desafio = nuevo;
    if (nonceNuevo) this.contador = 0;
    return { vencido: nuevo.stale, nonceNuevo, primerContacto };
  }

  /** Compatibilidad: `true` si la cabecera traía un desafío legible. */
  aceptarDesafio(cabecera: string | null): boolean {
    return this.renegociar(cabecera) !== null;
  }

  /** ¿Se está usando ya un desafío? Un `401` con él puede ser un nonce vencido. */
  get tieneDesafio(): boolean {
    return this.desafio !== null;
  }

  /** Para las pruebas y el diagnóstico: cuántas órdenes lleva este desafío. */
  get ordenesConEsteDesafio(): number {
    return this.contador;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * A5 (15-L) · UNA CREDENCIAL RECHAZADA NO SE VUELVE A PRESENTAR
   *
   * Estos equipos bloquean la IP de origen tras unos pocos inicios de sesión
   * fallidos. Cada cliente ya se negaba a repetir una orden con la clave mala,
   * pero la escucha reconectaba cada pocos segundos y el sondeo de estado cada
   * cinco minutos: cada intento, un fallo más hacia el bloqueo del Mac. La
   * marca vive en la sesión compartida del equipo —la misma para órdenes,
   * escuchas y sondeos— y se borra sola cuando la credencial cambia (la
   * sesión es otra) o cuando pasa la ventana.
   */
  private rechazadaEn: number | null = null;

  marcarRechazada(ahora: number): void {
    this.rechazadaEn = ahora;
  }

  /** Cuánto hace que el equipo la rechazó, o `null` si no la rechazó dentro de la ventana. */
  rechazadaHace(ahora: number, ventanaMs: number): number | null {
    if (this.rechazadaEn === null) return null;
    const hace = ahora - this.rechazadaEn;
    if (hace < ventanaMs) return hace;
    this.rechazadaEn = null;
    return null;
  }

  /** Para las pruebas: las credenciales con las que se creó (nunca se registra). */
  mismasCredenciales(credenciales: CredencialesDigest): boolean {
    return (
      credenciales.usuario === this.credenciales.usuario &&
      credenciales.clave === this.credenciales.clave
    );
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-12 · UNA SESIÓN DIGEST POR EQUIPO, COMPARTIDA
 *
 * El proveedor creaba un cliente nuevo para cada sondeo, cada lectura de
 * capacidades y cada escucha; cada uno negociaba su propio nonce con el MISMO
 * equipo. Un equipo que emite un nonce nuevo invalida el anterior, así que el
 * cliente de las órdenes se quedaba con uno muerto sin saberlo. Compartida,
 * quien renegocia lo hace por todos, y el contador `nc` es uno solo.
 *
 * Se indexa además por la función de transporte: cada prueba inyecta su
 * propio `fetch` y así no hereda el desafío de la anterior.
 */
const sesionesPorTransporte = new WeakMap<object, Map<string, SesionDigest>>();

export const sesionDigestCompartida = (
  transporte: object,
  destino: string,
  credenciales: CredencialesDigest,
  generarCnonce: () => string = cnonceAleatorio,
): SesionDigest => {
  const porDestino = sesionesPorTransporte.get(transporte) ?? new Map<string, SesionDigest>();
  sesionesPorTransporte.set(transporte, porDestino);
  const clave = `${destino}|${credenciales.usuario}`;
  const existente = porDestino.get(clave);
  // Si la clave cambió (edición del equipo), la sesión vieja no sirve.
  if (existente !== undefined && existente.mismasCredenciales(credenciales)) return existente;
  const nueva = new SesionDigest(credenciales, generarCnonce);
  porDestino.set(clave, nueva);
  return nueva;
};

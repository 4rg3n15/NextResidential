import { compartidoNuevo } from './marca-de-credencial';
import type { CompartidoDelEquipo, MarcaDeCredencial } from './marca-de-credencial';
import { cnonceAleatorio, construirAutorizacion, interpretarDesafio } from './digest-calculo';
import type { CredencialesDigest, DesafioDigest } from './digest-calculo';

/**
 * Autenticación **Digest MD5**, escrita aquí y sin dependencias nuevas.
 *
 * El cálculo puro (leer el desafío, construir la cabecera) vive en
 * `digest-calculo.ts`; aquí, la SESIÓN con estado y su registro por equipo.
 * Se re-exporta todo para que quien importaba de `./digest` no cambie.
 *
 * **El ciclo es de dos viajes, y el segundo se ahorra.** La primera petición va
 * sin credenciales, el equipo responde `401` con su desafío, y la segunda lo
 * responde. A partir de ahí el desafío se **reutiliza** con el contador `nc`
 * incrementado. Cuando el equipo rechaza el nonce guardado, se descarta y se
 * hace UN intercambio limpio (E1-b, `cliente.ts`).
 *
 * Reutilizar el desafío no es una optimización cosmética. Cada `401` extra es
 * un intento fallido de autenticación desde el punto de vista del equipo, y
 * estos aparatos **bloquean la cuenta** tras unos pocos.
 */
export * from './digest-calculo';

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
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-12 · EL CONTADOR NO SE REINICIA SI EL NONCE ES EL MISMO
 *
 * `nc` es por nonce y el equipo rechaza uno repetido. Antes, cualquier `401`
 * ponía el contador a cero aunque el equipo devolviera el MISMO nonce: el
 * reintento viajaba con `nc=00000001` ya usado y el equipo lo rechazaba otra
 * vez. Dos `401` seguidos se leían como credencial, y la segunda orden de cada
 * equipo acababa en «usuario o clave» (sitio, 26/09/2026).
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * E1 (15-M) · EL DESAFÍO ES DE LA SESIÓN; LA MARCA DE RECHAZO, DEL EQUIPO
 *
 * La marca «ya la rechazó» (A5, 15-L) se comparte entre todas las sesiones del
 * mismo equipo y credencial —órdenes, sondeos y escucha— para que ninguna
 * vuelva a presentar una clave que el equipo rechazó. El desafío, en cambio,
 * puede ser propio de una conexión (E1-c): la escucha larga negocia el suyo y
 * no pisa el de las órdenes.
 */
export class SesionDigest {
  private desafio: DesafioDigest | null = null;

  constructor(
    private readonly credenciales: CredencialesDigest,
    private readonly generarCnonce: () => string = cnonceAleatorio,
    /** E1-c · la marca de rechazo y el contador `nc` por nonce, del equipo. */
    private readonly compartido: CompartidoDelEquipo = compartidoNuevo(),
  ) {}

  /** Cabecera para la siguiente petición, o `null` si aún no hay desafío. */
  autorizacionPara(metodo: string, uri: string): string | null {
    if (this.desafio === null) return null;
    // El `nc` lo da el contador del EQUIPO para ese nonce: dos sesiones con
    // el mismo nonce nunca repiten número (E1-c).
    return construirAutorizacion(
      this.desafio,
      this.credenciales,
      metodo,
      uri,
      this.compartido.nonces.siguiente(this.desafio.nonce),
      this.generarCnonce(),
    );
  }

  /**
   * Guarda el desafío recibido en un `401`. El contador es por nonce (en el
   * estado compartido), así que un nonce repetido sigue contando donde iba.
   * `null` si la cabecera no trae un desafío Digest legible.
   */
  renegociar(cabecera: string | null): Renegociacion | null {
    const nuevo = interpretarDesafio(cabecera);
    if (nuevo === null) return null;
    const primerContacto = this.desafio === null;
    const nonceNuevo = this.desafio?.nonce !== nuevo.nonce;
    this.desafio = nuevo;
    return { vencido: nuevo.stale, nonceNuevo, primerContacto };
  }

  /** Compatibilidad: `true` si la cabecera traía un desafío legible. */
  aceptarDesafio(cabecera: string | null): boolean {
    return this.renegociar(cabecera) !== null;
  }

  /**
   * E1-b · el equipo rechazó el nonce guardado: se olvida, y la siguiente
   * petición sale SIN credencial para negociar uno en un intercambio limpio.
   */
  descartarDesafio(): void {
    this.desafio = null;
  }

  /** ¿Se está usando ya un desafío? Un `401` con él puede ser un nonce vencido. */
  get tieneDesafio(): boolean {
    return this.desafio !== null;
  }

  /** Para las pruebas y el diagnóstico: cuántas órdenes lleva este desafío. */
  get ordenesConEsteDesafio(): number {
    return this.desafio === null ? 0 : this.compartido.nonces.cuenta(this.desafio.nonce);
  }

  /** Lo compartido con las demás sesiones del equipo (marca y contador). */
  get estadoCompartido(): CompartidoDelEquipo {
    return this.compartido;
  }

  get marcaDeCredencial(): MarcaDeCredencial {
    return this.compartido.marca;
  }

  /**
   * A5 (15-L) · una credencial rechazada no se vuelve a presentar (ver
   * `MarcaDeCredencial`). Con `bloqueoMs`, hasta que el equipo la desbloquee.
   */
  marcarRechazada(ahora: number, bloqueoMs: number | null = null): void {
    this.compartido.marca.marcarRechazada(ahora, bloqueoMs);
  }

  /** Cuánto hace que el equipo la rechazó, o `null` si no la rechazó dentro de la ventana. */
  rechazadaHace(ahora: number, ventanaMs: number): number | null {
    return this.compartido.marca.rechazadaHace(ahora, ventanaMs);
  }

  segundosDeBloqueo(ahora: number): number | null {
    return this.compartido.marca.segundosDeBloqueo(ahora);
  }

  /** E1-e · «Probar conexión»: la decisión humana de presentarla otra vez. */
  olvidarRechazo(): void {
    this.compartido.marca.olvidar();
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
 * equipo. Compartida, quien renegocia lo hace por todos, y el contador `nc` es
 * uno solo. Con `propia: true` (E1-c) la conexión recibe una sesión SUYA —su
 * desafío, su `nc`— que comparte la marca de rechazo con las demás.
 *
 * Se indexa además por la función de transporte: cada prueba inyecta su
 * propio `fetch` y así no hereda el desafío de la anterior.
 */
const sesionesPorTransporte = new WeakMap<object, Map<string, SesionDigest>>();

export interface OpcionesDeSesionCompartida {
  /** E1-c · una sesión propia (desafío y `nc` suyos) con la marca compartida. */
  readonly propia?: boolean;
}

const claveDe = (destino: string, usuario: string): string => `${destino}|${usuario}`;

export const sesionDigestCompartida = (
  transporte: object,
  destino: string,
  credenciales: CredencialesDigest,
  generarCnonce: () => string = cnonceAleatorio,
  opciones: OpcionesDeSesionCompartida = {},
): SesionDigest => {
  const porDestino = sesionesPorTransporte.get(transporte) ?? new Map<string, SesionDigest>();
  sesionesPorTransporte.set(transporte, porDestino);
  const clave = claveDe(destino, credenciales.usuario);
  let compartida = porDestino.get(clave);
  // Si la clave cambió (edición del equipo), la sesión vieja no sirve: ni su
  // desafío ni su marca de rechazo (E1-e), que era de OTRA credencial.
  if (compartida === undefined || !compartida.mismasCredenciales(credenciales)) {
    compartida = new SesionDigest(credenciales, generarCnonce);
    porDestino.set(clave, compartida);
  }
  return opciones.propia === true
    ? new SesionDigest(credenciales, generarCnonce, compartida.estadoCompartido)
    : compartida;
};

/** E1-e · borra la marca de rechazo del equipo, si la hay. */
export const olvidarRechazoDigest = (
  transporte: object,
  destino: string,
  usuario: string,
): void => {
  sesionesPorTransporte.get(transporte)?.get(claveDe(destino, usuario))?.olvidarRechazo();
};

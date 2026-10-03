/**
 * 15-Q2 · E2 · los servidores ICE con los que la consola negocia el video.
 *
 * El puerto sólo dice QUÉ se entrega: una lista de servidores y cuánto vale.
 * CÓMO se fabrica la credencial del TURN (efímera, a partir de un secreto que
 * nunca sale de la API) es infraestructura. Sin nada configurado, la lista va
 * vacía: la consola negocia como siempre, en la red del conjunto (R1).
 */
export interface ServidorIce {
  readonly urls: readonly string[];
  readonly username?: string;
  readonly credential?: string;
}

export interface ServidoresIceDeUnUsuario {
  readonly iceServers: readonly ServidorIce[];
  /** Cuánto vale la credencial del TURN; la consola vuelve a pedir antes de que caduque. */
  readonly ttlSegundos: number;
}

export interface ServidoresIce {
  para(usuarioId: string): ServidoresIceDeUnUsuario;
}

export const SERVIDORES_ICE = Symbol.for('ncr.puerto.ServidoresIce');

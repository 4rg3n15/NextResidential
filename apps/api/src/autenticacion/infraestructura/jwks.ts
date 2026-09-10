import { createRemoteJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { RechazoDeAutenticacion } from '../dominio/errores';

/**
 * Caché del JWKS. Los números salen de `verificacion-jwt-asimetrica.md` §2.3 y
 * no son ajustables a ojo:
 *
 *  · TTL 600 s — el mismo que Supabase cachea el JWKS en su edge. Subirlo
 *    significaría seguir aceptando tokens de una clave revocada MÁS TIEMPO del
 *    que lo hace la propia plataforma, y rompería la aritmética del margen de
 *    20 minutos de la rotación (10 del edge + 10 nuestros).
 *  · Suelo de 60 s entre refrescos reactivos — sin él, un atacante fabrica
 *    tokens con `kid` inventado y provoca una descarga por petición:
 *    amplificación de denegación de servicio contra el propio Auth.
 */
export interface OpcionesJwks {
  readonly url: string;
  readonly ttlSegundos: number;
  readonly refrescoMinimoSegundos: number;
}

/**
 * Resultado de la sonda. Es un estado con nombre y no un booleano porque los
 * tres modos de fallo piden acciones distintas y quien lo lee —`/ready`, el
 * arranque— tiene que poder decirlas:
 *
 *  · `inalcanzable` — la URL está mal o el servicio no responde. Se arregla en
 *    el entorno. Es lo que ocurría con `/auth/v1/jwks`, que devuelve 404.
 *  · `sin-claves` — la URL es la buena y responde 200, pero el documento no
 *    trae ninguna clave. Ocurre cuando el proyecto no tiene llaves asimétricas
 *    habilitadas. Se arregla en el panel, no en el entorno, y es el caso que
 *    más engaña: hay endpoint, hay JSON válido, y no se verifica ni un token.
 *  · `en-espera` — un fallo reciente todavía dentro del suelo de refresco.
 */
export type EstadoDeJwks =
  | { readonly estado: 'ok'; readonly claves: number }
  | { readonly estado: 'inalcanzable'; readonly detalle: string }
  | { readonly estado: 'sin-claves' }
  | { readonly estado: 'en-espera' };

/** Texto corto para la bitácora y para `/ready`. Nunca incluye la URL: puede
 * llevar el `project-ref` y no tiene por qué salir en una respuesta pública. */
export const describir = (e: EstadoDeJwks): string =>
  e.estado === 'ok' ? 'ok' : e.estado === 'sin-claves' ? 'sin-claves' : e.estado;

type ConjuntoRemoto = ReturnType<typeof createRemoteJWKSet>;

export class ProveedorDeJwks {
  private conjunto: ConjuntoRemoto | null = null;
  private ultimoIntento = 0;

  constructor(
    private readonly opciones: OpcionesJwks,
    /** Inyectable para las pruebas: evita red en la suite. */
    private readonly crear: typeof createRemoteJWKSet = createRemoteJWKSet,
  ) {}

  /**
   * `createRemoteJWKSet` de `jose` ya implementa la caché con TTL y el
   * refresco reactivo ante `kid` desconocido con su propio suelo temporal. Se
   * usa esa implementación en vez de escribir una: reimplementar una caché de
   * claves es precisamente donde se cometen los errores que esta clase intenta
   * evitar. Lo que sí es nuestro es la CONFIGURACIÓN de los plazos.
   */
  obtener(): JWTVerifyGetKey {
    return this.conjuntoRemoto();
  }

  private conjuntoRemoto(): ConjuntoRemoto {
    if (this.conjunto) return this.conjunto;
    const ahora = Date.now();
    if (ahora - this.ultimoIntento < this.opciones.refrescoMinimoSegundos * 1000) {
      throw new RechazoDeAutenticacion('JWKS_NO_DISPONIBLE');
    }
    this.ultimoIntento = ahora;
    this.conjunto = this.crear(new URL(this.opciones.url), {
      cacheMaxAge: this.opciones.ttlSegundos * 1000,
      cooldownDuration: this.opciones.refrescoMinimoSegundos * 1000,
      timeoutDuration: 5000,
    });
    return this.conjunto;
  }

  /**
   * Sonda de disponibilidad. La consultan `/ready` y la comprobación de
   * arranque: sin JWKS la API no puede verificar ni un token.
   *
   * Dos cosas que hay que forzar, y por qué:
   *
   * 1. **La descarga.** `createRemoteJWKSet` es PEREZOSO —no pide nada hasta la
   *    primera verificación—, así que limitarse a construirlo haría que
   *    `/ready` respondiera «ok» con un endpoint inalcanzable. Se fuerza con
   *    una resolución de un `kid` que no existe: si el documento se descargó,
   *    `jose` responde «no hay clave que coincida», y esa respuesta es
   *    precisamente la prueba de que la descarga funcionó.
   *
   * 2. **El contenido.** Que la descarga funcione NO basta, y esto es lo que la
   *    versión anterior de esta sonda no vio: un proyecto sin llaves
   *    asimétricas devuelve `200` con `{"keys":[]}`, `jose` contesta igualmente
   *    «no hay clave que coincida», y la sonda daba verde mientras ningún token
   *    del mundo podía verificarse. Por eso se inspecciona el documento
   *    descargado y se exige **al menos una clave**.
   */
  async sondear(): Promise<EstadoDeJwks> {
    let conjunto: ConjuntoRemoto;
    try {
      conjunto = this.conjuntoRemoto();
    } catch {
      return { estado: 'en-espera' };
    }
    try {
      await conjunto(
        { alg: 'RS256', kid: 'sonda-de-disponibilidad' },
        // `jose` solo usa el encabezado para elegir la clave.
        { payload: '', signature: '', signatures: [] } as never,
      );
    } catch (e) {
      // La única excepción que acredita que el documento se descargó y se pudo
      // inspeccionar es «no coincide ninguna clave». Cualquier otra —404, DNS,
      // tiempo agotado, JSON inválido— es que no se llegó al documento.
      const esNoCoincide =
        e instanceof Error && /no applicable key|JWKSNoMatchingKey/i.test(`${e.name} ${e.message}`);
      if (!esNoCoincide) {
        return {
          estado: 'inalcanzable',
          detalle: e instanceof Error ? `${e.name}: ${e.message}` : 'error desconocido',
        };
      }
    }
    const claves = conjunto.jwks()?.keys.length ?? 0;
    return claves > 0 ? { estado: 'ok', claves } : { estado: 'sin-claves' };
  }

  get disponible(): boolean {
    return this.conjunto !== null;
  }
}

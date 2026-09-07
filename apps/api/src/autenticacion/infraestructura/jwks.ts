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

export class ProveedorDeJwks {
  private conjunto: JWTVerifyGetKey | null = null;
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
   * `/ready` lo consulta: sin JWKS la API no puede autenticar y no está lista.
   *
   * `createRemoteJWKSet` es PEREZOSO —no descarga nada hasta la primera
   * verificación—, así que limitarse a construirlo haría que `/ready`
   * respondiera «ok» con un endpoint inalcanzable. Aquí se fuerza una
   * resolución con un `kid` que no existe: si el JWKS se descargó, `jose`
   * responde «no hay clave que coincida», y esa respuesta es precisamente la
   * prueba de que la descarga funcionó. Un fallo de red da otro error.
   */
  async precalentar(): Promise<boolean> {
    try {
      const conjunto = this.obtener();
      await conjunto(
        { alg: 'RS256', kid: 'sonda-de-disponibilidad' },
        // `jose` solo usa el encabezado para elegir la clave.
        { payload: '', signature: '', signatures: [] } as never,
      );
      return true;
    } catch (e) {
      // La única excepción que acredita disponibilidad es «no coincide ninguna
      // clave»: significa que el documento se descargó y se pudo inspeccionar.
      return (
        e instanceof Error && /no applicable key|JWKSNoMatchingKey/i.test(`${e.name} ${e.message}`)
      );
    }
  }

  get disponible(): boolean {
    return this.conjunto !== null;
  }
}

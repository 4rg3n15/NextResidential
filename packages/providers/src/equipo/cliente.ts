import { SesionDigest, cnonceAleatorio } from '../barrera/digest';

/**
 * EL CLIENTE QUE HABLA CON UN EQUIPO. Uno solo, para los tres aparatos.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ ES DE AQUÍ Y QUÉ NO
 *
 * Aquí vive el **transporte**: Digest, tiempos límite, la renegociación del
 * desafío y el flujo de eventos que se mantiene abierto. **Ninguna ruta.** Las
 * rutas viven en el adaptador de cada familia de equipo, cada una con su
 * etiqueta de procedencia —VERIFICADA o DOCUMENTADA, NO VERIFICADA—, porque lo
 * que este proyecto prohíbe no es repetir código sino **suponer una ruta por
 * analogía**: dar por buena `Traffic` o `System/IO` en la cámara costó dos
 * intentos fallidos contra el equipo real.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL DESAFÍO SE REUTILIZA, Y NO ES COSMÉTICA
 *
 * Cada `401` extra cuenta como intento fallido para el equipo, y estos aparatos
 * **bloquean la cuenta** tras unos pocos. Se renegocia UNA vez por petición y
 * no se insiste: dos rechazos seguidos son credenciales, no caducidad.
 */

export interface OpcionesDeEquipo {
  readonly host: string;
  readonly puerto?: number;
  readonly usuario: string;
  readonly clave: string;
  readonly tiempoLimiteMs?: number;
  /** Inyectable para que las pruebas corran **sin red y sin equipo** (ADR-03). */
  readonly peticion?: typeof fetch;
  readonly ahora?: () => number;
  readonly generarCnonce?: () => string;
}

/** Más holgado que el de la barrera: la carga de una plantilla no es un pulso. */
export const TIEMPO_LIMITE_DE_EQUIPO_MS = 5000;

export interface RespuestaDeEquipo {
  readonly estado: number;
  readonly ok: boolean;
  readonly cuerpo: string;
  readonly latenciaMs: number;
}

export interface CuerpoDePeticion {
  readonly contenido: string | Uint8Array;
  readonly tipo: string;
}

/**
 * Un equipo puede no contestar por tres razones distintas, y el operador
 * necesita verlas separadas: apagado, red cortada o tiempo agotado se resuelven
 * llamando al técnico; un rechazo, revisando la configuración.
 */
export class EquipoInalcanzable extends Error {
  constructor(
    readonly detalle: string,
    readonly latenciaMs: number,
  ) {
    super(detalle);
    this.name = 'EquipoInalcanzable';
  }
}

export class ClienteDeEquipo {
  private readonly sesion: SesionDigest;
  private readonly base: string;
  private readonly tiempoLimiteMs: number;
  private readonly peticion: typeof fetch;
  private readonly ahora: () => number;

  constructor(private readonly opciones: OpcionesDeEquipo) {
    this.sesion = new SesionDigest(
      { usuario: opciones.usuario, clave: opciones.clave },
      opciones.generarCnonce ?? cnonceAleatorio,
    );
    // Los equipos medidos responden por HTTP con Digest, **no** por HTTPS:
    // forzar TLS aquí los dejaría inalcanzables. Anotado en la guía.
    this.base = `http://${opciones.host}:${String(opciones.puerto ?? 80)}`;
    this.tiempoLimiteMs = opciones.tiempoLimiteMs ?? TIEMPO_LIMITE_DE_EQUIPO_MS;
    this.peticion = opciones.peticion ?? fetch;
    this.ahora = opciones.ahora ?? (() => Date.now());
  }

  async pedir(metodo: string, ruta: string, cuerpo?: CuerpoDePeticion): Promise<RespuestaDeEquipo> {
    const comienzo = this.ahora();
    try {
      let respuesta = await this.enviar(metodo, ruta, cuerpo);
      if (respuesta.status === 401) {
        if (this.sesion.aceptarDesafio(respuesta.headers.get('www-authenticate'))) {
          respuesta = await this.enviar(metodo, ruta, cuerpo);
        }
      }
      return {
        estado: respuesta.status,
        ok: respuesta.ok,
        cuerpo: await respuesta.text(),
        latenciaMs: this.ahora() - comienzo,
      };
    } catch (error) {
      throw new EquipoInalcanzable(this.motivoDe(error), this.ahora() - comienzo);
    }
  }

  /**
   * Abre una respuesta en FLUJO y la deja abierta.
   *
   * Es lo que necesita el canal de eventos: una respuesta que no termina nunca
   * y que va entregando trozos. Aquí **no se interpreta nada** —quién decide
   * qué es un bloque depende del formato de cada equipo— y por eso lo que sale
   * son cadenas tal como llegan.
   *
   * El tiempo límite se aplica sólo a la APERTURA: un `AbortSignal.timeout`
   * sobre todo el flujo lo cortaría a los pocos segundos, que es justo lo
   * contrario de lo que hace falta.
   */
  async *flujo(ruta: string, cancelar?: AbortSignal): AsyncIterable<string> {
    const respuesta = await this.abrirFlujo(ruta, cancelar);
    const cuerpo = respuesta.body;
    if (cuerpo === null) return;

    const decodificador = new TextDecoder();
    const lector = cuerpo.getReader();
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) return;
        if (value !== undefined) yield decodificador.decode(value, { stream: true });
      }
    } finally {
      // Sin esto, un equipo que deja de emitir mantiene el socket abierto para
      // siempre y el proceso acumula uno por reconexión.
      await lector.cancel().catch(() => undefined);
    }
  }

  private async abrirFlujo(ruta: string, cancelar?: AbortSignal): Promise<Response> {
    const primera = await this.enviar('GET', ruta, undefined, cancelar);
    if (primera.status !== 401) return primera;
    if (!this.sesion.aceptarDesafio(primera.headers.get('www-authenticate'))) return primera;
    return this.enviar('GET', ruta, undefined, cancelar);
  }

  private async enviar(
    metodo: string,
    ruta: string,
    cuerpo?: CuerpoDePeticion,
    cancelar?: AbortSignal,
  ): Promise<Response> {
    const autorizacion = this.sesion.autorizacionPara(metodo, ruta);
    const cabeceras: Record<string, string> = {};
    if (cuerpo !== undefined) cabeceras['content-type'] = cuerpo.tipo;
    if (autorizacion !== null) cabeceras['authorization'] = autorizacion;

    return this.peticion(`${this.base}${ruta}`, {
      method: metodo,
      headers: cabeceras,
      ...(cuerpo === undefined ? {} : { body: cuerpo.contenido }),
      signal: cancelar ?? AbortSignal.timeout(this.tiempoLimiteMs),
    });
  }

  private motivoDe(error: unknown): string {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return `El equipo no respondió en ${String(this.tiempoLimiteMs)} ms`;
    }
    return 'No se pudo alcanzar el equipo';
  }

  /** Solo para diagnóstico; no expone la credencial. */
  get destino(): string {
    return `${this.opciones.host}:${String(this.opciones.puerto ?? 80)}`;
  }
}

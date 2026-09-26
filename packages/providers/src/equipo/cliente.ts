import type { Bitacora } from '@ncr/domain-core';
import { cnonceAleatorio, interpretarDesafio, sesionDigestCompartida } from '../barrera/digest';
import type { Renegociacion, SesionDigest } from '../barrera/digest';
import { intercambioParaBitacora } from './intercambio';

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
  /**
   * `http` por omisión, y es una medida, no una preferencia: la DS-TCG405-E
   * responde por HTTP con Digest, comprobado en sitio. Forzar TLS la dejaría
   * inalcanzable y el diagnóstico apuntaría a la red. Configurable porque otros
   * modelos sí lo traen (A.1).
   */
  readonly protocolo?: 'http' | 'https';
  readonly usuario: string;
  readonly clave: string;
  readonly tiempoLimiteMs?: number;
  /** Inyectable para que las pruebas corran **sin red y sin equipo** (ADR-03). */
  readonly peticion?: typeof fetch;
  readonly ahora?: () => number;
  readonly generarCnonce?: () => string;
  /**
   * H-SITIO-12/13/14 · a dónde va lo que en sitio no se veía: renegociaciones
   * del Digest, intercambios de órdenes y el flujo de eventos. Sin ella, el
   * cliente calla — que es lo que hacía hasta la 15-K.
   */
  readonly traza?: Bitacora;
  /** Para la bitácora: el equipo al que pertenece este cliente. */
  readonly dispositivoId?: string;
}

/** Más holgado que el de la barrera: la carga de una plantilla no es un pulso. */
export const TIEMPO_LIMITE_DE_EQUIPO_MS = 5000;

export interface RespuestaDeEquipo {
  readonly estado: number;
  readonly ok: boolean;
  readonly cuerpo: string;
  readonly latenciaMs: number;
  /**
   * H-SITIO-12 · el `401` final llegó con `stale=true`: el equipo aceptó el
   * resumen y rechazó el nonce. NO es una clave errónea.
   */
  readonly desafioVencido?: boolean;
}

/** Lo que el llamante pide además de la petición en sí. */
export interface OpcionesDePeticion {
  /**
   * H-SITIO-13 · registra la petición y la respuesta completas —saneadas— con
   * esta etiqueta. Sólo para órdenes: nunca para cargas con imagen.
   */
  readonly registrarIntercambio?: string;
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

/** Una respuesta con su veredicto de autenticación ya resuelto. */
interface ConDigest {
  readonly respuesta: Response;
  readonly desafioVencido: boolean;
}

/** Libera el socket de una respuesta que no se va a leer. */
const descartar = async (respuesta: Response): Promise<void> => {
  try {
    await respuesta.body?.cancel();
  } catch {
    /* ya cerrado */
  }
};

export class ClienteDeEquipo {
  private readonly sesion: SesionDigest;
  private readonly base: string;
  private readonly tiempoLimiteMs: number;
  private readonly peticion: typeof fetch;
  private readonly ahora: () => number;

  constructor(private readonly opciones: OpcionesDeEquipo) {
    // Los equipos medidos responden por HTTP con Digest, **no** por HTTPS:
    // forzar TLS aquí los dejaría inalcanzables. Anotado en la guía.
    this.base = `${opciones.protocolo ?? 'http'}://${opciones.host}:${String(opciones.puerto ?? 80)}`;
    this.tiempoLimiteMs = opciones.tiempoLimiteMs ?? TIEMPO_LIMITE_DE_EQUIPO_MS;
    this.peticion = opciones.peticion ?? fetch;
    this.ahora = opciones.ahora ?? (() => Date.now());
    // H-SITIO-12 · UNA sesión por equipo en todo el proceso (ver digest.ts).
    this.sesion = sesionDigestCompartida(
      this.peticion,
      this.base,
      { usuario: opciones.usuario, clave: opciones.clave },
      opciones.generarCnonce ?? cnonceAleatorio,
    );
  }

  async pedir(
    metodo: string,
    ruta: string,
    cuerpo?: CuerpoDePeticion,
    extra?: OpcionesDePeticion,
  ): Promise<RespuestaDeEquipo> {
    const comienzo = this.ahora();
    try {
      const { respuesta, desafioVencido } = await this.conDigest(metodo, ruta, () =>
        this.enviar(metodo, ruta, cuerpo),
      );
      const texto = await respuesta.text();
      const latenciaMs = this.ahora() - comienzo;
      if (extra?.registrarIntercambio !== undefined) {
        this.opciones.traza?.registrar(
          'info',
          `intercambio con el equipo: ${extra.registrarIntercambio}`,
          {
            ...this.contexto(),
            ...intercambioParaBitacora({
              metodo,
              ruta,
              enviado:
                cuerpo === undefined
                  ? null
                  : typeof cuerpo.contenido === 'string'
                    ? cuerpo.contenido
                    : `(${String(cuerpo.contenido.byteLength)} bytes ${cuerpo.tipo})`,
              estado: respuesta.status,
              recibido: texto,
              latenciaMs,
            }),
          },
        );
      }
      return {
        estado: respuesta.status,
        ok: respuesta.ok,
        cuerpo: texto,
        latenciaMs,
        ...(desafioVencido ? { desafioVencido: true } : {}),
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
  async *flujo(
    ruta: string,
    cancelar?: AbortSignal,
    peticion?: { readonly metodo: string; readonly cuerpo?: CuerpoDePeticion },
  ): AsyncIterable<string> {
    const respuesta = await this.abrirFlujo(ruta, cancelar, peticion);
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

  /**
   * H-SITIO-14 · el flujo de eventos en BYTES, con su cabecera de tipo. El
   * flujo del equipo es `multipart` con partes JSON o XML **e imágenes**; leído
   * como texto, los bytes de una foto rompían el análisis del resto.
   */
  async abrirFlujoDeEventos(
    ruta: string,
    cancelar?: AbortSignal,
    peticion?: { readonly metodo: string; readonly cuerpo?: CuerpoDePeticion },
  ): Promise<{
    readonly estado: number;
    readonly tipo: string | null;
    readonly desafioVencido: boolean;
    readonly trozos: AsyncIterable<Uint8Array>;
  }> {
    const metodo = peticion?.metodo ?? 'GET';
    const { respuesta, desafioVencido } = await this.conDigest(metodo, ruta, () =>
      this.enviar(metodo, ruta, peticion?.cuerpo, cancelar),
    );
    const cuerpo = respuesta.body;
    async function* trozos(): AsyncIterable<Uint8Array> {
      if (cuerpo === null) {
        // Un simulado sin flujo: su texto entero, de una vez.
        const texto = await respuesta.text();
        if (texto !== '') yield new TextEncoder().encode(texto);
        return;
      }
      const lector = cuerpo.getReader();
      try {
        for (;;) {
          const { done, value } = await lector.read();
          if (done) return;
          if (value !== undefined) yield value;
        }
      } finally {
        await lector.cancel().catch(() => undefined);
      }
    }
    return {
      estado: respuesta.status,
      tipo: respuesta.headers.get('content-type'),
      desafioVencido,
      trozos: trozos(),
    };
  }

  /**
   * Como `flujo`, pero entrega los BYTES tal cual: es lo que necesita el audio,
   * donde decodificar como texto corrompería el códec.
   */
  async *flujoBinario(ruta: string, cancelar?: AbortSignal): AsyncIterable<Uint8Array> {
    const respuesta = await this.abrirFlujo(ruta, cancelar);
    const cuerpo = respuesta.body;
    if (cuerpo === null) return;
    const lector = cuerpo.getReader();
    try {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) return;
        if (value !== undefined) yield value;
      }
    } finally {
      await lector.cancel().catch(() => undefined);
    }
  }

  /**
   * A4 · SUBE un flujo al equipo y lo deja abierto: un solo `PUT` sin
   * `Content-Length`, en trozos, que dura lo que dure la sesión de audio.
   *
   * Resuelve cuando el equipo CONTESTA (o rechaza), no cuando el flujo acaba:
   * quien habla no puede esperar a colgar para saber si el equipo aceptó. Si
   * el equipo pide Digest en este momento, se reintenta UNA vez con un flujo
   * nuevo sobre la misma cola: los trozos que el primer intento ya había
   * tomado se pierden, y es lo que hay —un flujo no se rebobina—.
   */
  async subirFlujo(
    ruta: string,
    cuerpo: () => ReadableStream<Uint8Array>,
    tipo: string,
    cancelar?: AbortSignal,
  ): Promise<RespuestaDeEquipo> {
    const comienzo = this.ahora();
    try {
      const { respuesta, desafioVencido } = await this.conDigest('PUT', ruta, () =>
        this.enviarFlujo('PUT', ruta, cuerpo(), tipo, cancelar),
      );
      return {
        estado: respuesta.status,
        ok: respuesta.ok,
        cuerpo: '',
        latenciaMs: this.ahora() - comienzo,
        ...(desafioVencido ? { desafioVencido: true } : {}),
      };
    } catch (error) {
      throw new EquipoInalcanzable(this.motivoDe(error), this.ahora() - comienzo);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * H-SITIO-12 · UN SOLO REINTENTO, Y EL `401` FINAL CLASIFICADO
   *
   * Ante `401` se toma el desafío que trae —compartido con los demás clientes
   * del mismo equipo— y se repite UNA vez. Si el segundo también es `401`:
   *
   *  · con `stale=true` es un nonce vencido otra vez, NO la clave. Se dice así
   *    y quien llama lo trata como reintentable;
   *  · sin él, es la credencial. No se insiste: el equipo bloquea la cuenta.
   *
   * Aplica igual a órdenes, sondeos y suscripciones: todas pasan por aquí.
   */
  private async conDigest(
    metodo: string,
    ruta: string,
    enviar: () => Promise<Response>,
  ): Promise<ConDigest> {
    const primera = await enviar();
    if (primera.status !== 401) return { respuesta: primera, desafioVencido: false };

    const renegociacion = this.sesion.renegociar(primera.headers.get('www-authenticate'));
    if (renegociacion === null) {
      this.opciones.traza?.registrar('aviso', 'el equipo contestó 401 SIN desafío Digest', {
        ...this.contexto(),
        metodo,
        ruta,
      });
      return { respuesta: primera, desafioVencido: false };
    }
    this.anotarRenegociacion(renegociacion, metodo, ruta);
    await descartar(primera);

    const segunda = await enviar();
    if (segunda.status !== 401) return { respuesta: segunda, desafioVencido: false };

    const cabecera = segunda.headers.get('www-authenticate');
    const vencido = interpretarDesafio(cabecera)?.stale === true;
    // Se guarda para la PRÓXIMA petición; ésta no se repite.
    this.sesion.renegociar(cabecera);
    this.opciones.traza?.registrar(
      vencido ? 'aviso' : 'error',
      vencido
        ? 'el equipo venció el desafío Digest dos veces seguidas: NO es la clave'
        : 'el equipo rechazó usuario o clave tras renegociar el Digest: NO se reintenta',
      { ...this.contexto(), metodo, ruta },
    );
    return { respuesta: segunda, desafioVencido: vencido };
  }

  private anotarRenegociacion(r: Renegociacion, metodo: string, ruta: string): void {
    const motivo = r.primerContacto
      ? 'primer contacto'
      : r.vencido
        ? 'nonce vencido (stale)'
        : r.nonceNuevo
          ? 'nonce nuevo del equipo'
          : 'el equipo repitió el mismo nonce';
    this.opciones.traza?.registrar(
      r.primerContacto ? 'debug' : 'info',
      'Digest renegociado con el equipo',
      { ...this.contexto(), metodo, ruta, motivo },
    );
  }

  private contexto(): Record<string, unknown> {
    return {
      destino: this.destino,
      ...(this.opciones.dispositivoId === undefined
        ? {}
        : { dispositivoId: this.opciones.dispositivoId }),
    };
  }

  private enviarFlujo(
    metodo: string,
    ruta: string,
    cuerpo: ReadableStream<Uint8Array>,
    tipo: string,
    cancelar?: AbortSignal,
  ): Promise<Response> {
    const autorizacion = this.sesion.autorizacionPara(metodo, ruta);
    const cabeceras: Record<string, string> = { 'content-type': tipo };
    if (autorizacion !== null) cabeceras['authorization'] = autorizacion;
    // `duplex: 'half'` es lo que `fetch` exige para un cuerpo en flujo; no
    // está en el tipo de `RequestInit` de la biblioteca y sí en la
    // especificación, de ahí el cast. Sin tiempo límite: el flujo vive lo que
    // viva la sesión.
    const opciones = {
      method: metodo,
      headers: cabeceras,
      body: cuerpo,
      duplex: 'half',
      ...(cancelar === undefined ? {} : { signal: cancelar }),
    } as RequestInit;
    return this.peticion(`${this.base}${ruta}`, opciones);
  }

  private async abrirFlujo(
    ruta: string,
    cancelar?: AbortSignal,
    peticion?: { readonly metodo: string; readonly cuerpo?: CuerpoDePeticion },
  ): Promise<Response> {
    // La suscripción (6.5) abre el flujo con un POST y un cuerpo que dice qué
    // eventos se quieren; el `alertStream` clásico, con un GET sin cuerpo.
    const metodo = peticion?.metodo ?? 'GET';
    const { respuesta } = await this.conDigest(metodo, ruta, () =>
      this.enviar(metodo, ruta, peticion?.cuerpo, cancelar),
    );
    return respuesta;
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

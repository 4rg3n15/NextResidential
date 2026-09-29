import type { Bitacora } from '@ncr/domain-core';
import { cnonceAleatorio, interpretarDesafio, sesionDigestCompartida } from '../barrera/digest';
import type { Renegociacion, SesionDigest } from '../barrera/digest';
import { intercambioParaBitacora } from './intercambio';
import { interpretarUserCheck } from './user-check';
import { CredencialRechazada } from '../nucleo/errores';

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
 * **bloquean la cuenta** tras unos pocos. Un `401` al nonce guardado NUNCA es
 * la clave: se descarta y se hace UN intercambio limpio (E1). Sólo el `401`
 * que responde a la autenticación de ESE intercambio es la credencial.
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
  /**
   * E1-c (15-M) · una sesión Digest PROPIA de esta conexión: su desafío y su
   * `nc`, sin pisar ni heredar los de las demás. La escucha larga la usa. La
   * marca «credencial rechazada» sigue siendo una por equipo.
   */
  readonly sesionPropia?: boolean;
}

/** Más holgado que el de la barrera: la carga de una plantilla no es un pulso. */
export const TIEMPO_LIMITE_DE_EQUIPO_MS = 5000;

/**
 * A5 (15-L) · cuánto se deja de presentar una credencial que el equipo
 * rechazó, salvo que se corrija antes. `[SUPUESTO]` S-68: del orden del
 * bloqueo por inicios de sesión fallidos de estos equipos (30 min).
 */
export const VENTANA_DE_CREDENCIAL_RECHAZADA_MS = 30 * 60_000;

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
  /**
   * E1-b (15-M) · el `401` final llegó a una petición SIN credencial y SIN
   * `WWW-Authenticate`: no hubo con qué autenticarse. NO es la clave.
   */
  readonly sinDesafio?: boolean;
}

/** Lo que el llamante pide además de la petición en sí. */
export interface OpcionesDePeticion {
  /**
   * H-SITIO-13 · registra la petición y la respuesta completas —saneadas— con
   * esta etiqueta. Sólo para órdenes: nunca para cargas con imagen.
   */
  readonly registrarIntercambio?: string;
  /**
   * Anexo 15-K · la escritura NO lleva cuerpo, y es a propósito: abrir y cerrar
   * el canal de audio. Cualquier otra escritura sin cuerpo se niega (H-SITIO-15).
   */
  readonly sinCuerpo?: true;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * H-SITIO-15 · EL CLIENTE ISAPI NUNCA ENVÍA UNA ESCRITURA CON EL CUERPO VACÍO
 *
 * La terminal valida el contenido ANTES de autenticar: un `PUT`/`POST` vacío
 * recibe `400 badXmlContent` (errorCode 1610612739) sin llegar al desafío, así
 * que un cliente que sondea el Digest así —`curl --digest` lo hace— no se
 * autentica nunca. Este cliente manda el cuerpo desde la PRIMERA petición, la
 * que recibe el `401`, y la repite en la autenticada. Y una escritura sin
 * cuerpo es un error de programación que se dice aquí, no un `400` que
 * aparezca lejos: nuestro propio diagnóstico hacía `POST` vacíos a la
 * biblioteca de rostros y el simulado del anexo lo destapó.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class EscrituraSinCuerpo extends Error {
  constructor(metodo: string, ruta: string) {
    super(
      `${metodo} ${ruta} sin cuerpo: el equipo valida el contenido antes de autenticar y ` +
        'contesta 400 badXmlContent. Declare el cuerpo en el catálogo',
    );
    this.name = 'EscrituraSinCuerpo';
  }
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
  readonly sinDesafio: boolean;
}

/**
 * Lee el cuerpo SIN consumirlo para quien lo lea después: clona si la respuesta
 * lo permite (la de `fetch`); una simulada sin `clone` se lee tal cual, porque
 * su `text()` se puede llamar más de una vez.
 */
const leerSinConsumir = async (respuesta: Response): Promise<string> => {
  try {
    const legible = typeof respuesta.clone === 'function' ? respuesta.clone() : respuesta;
    return await legible.text();
  } catch {
    return '';
  }
};

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
      { propia: opciones.sesionPropia === true },
    );
  }

  /**
   * E1-e · «Probar conexión»: quien pulsa el botón decide presentar la clave
   * una vez más, aunque el equipo la rechazara hace un momento.
   */
  olvidarRechazo(): void {
    this.sesion.olvidarRechazo();
  }

  async pedir(
    metodo: string,
    ruta: string,
    cuerpo?: CuerpoDePeticion,
    extra?: OpcionesDePeticion,
  ): Promise<RespuestaDeEquipo> {
    if (metodo !== 'GET' && cuerpo === undefined && extra?.sinCuerpo !== true) {
      throw new EscrituraSinCuerpo(metodo, ruta);
    }
    const comienzo = this.ahora();
    try {
      const { respuesta, desafioVencido, sinDesafio } = await this.conDigest(metodo, ruta, () =>
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
        ...(sinDesafio ? { sinDesafio: true } : {}),
      };
    } catch (error) {
      if (error instanceof CredencialRechazada) throw error;
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
    readonly sinDesafio: boolean;
    readonly trozos: AsyncIterable<Uint8Array>;
  }> {
    const metodo = peticion?.metodo ?? 'GET';
    const { respuesta, desafioVencido, sinDesafio } = await this.conDigest(metodo, ruta, () =>
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
      sinDesafio,
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
      const { respuesta, desafioVencido, sinDesafio } = await this.conDigest('PUT', ruta, () =>
        this.enviarFlujo('PUT', ruta, cuerpo(), tipo, cancelar),
      );
      return {
        estado: respuesta.status,
        ok: respuesta.ok,
        cuerpo: '',
        latenciaMs: this.ahora() - comienzo,
        ...(desafioVencido ? { desafioVencido: true } : {}),
        ...(sinDesafio ? { sinDesafio: true } : {}),
      };
    } catch (error) {
      if (error instanceof CredencialRechazada) throw error;
      throw new EquipoInalcanzable(this.motivoDe(error), this.ahora() - comienzo);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * E1 (15-M) · QUÉ `401` ES LA CLAVE, Y CUÁL NO
   *
   * En sitio (28/09) la terminal y el videoportero contestaban `401` al nonce
   * que la escucha larga había negociado y las demás peticiones reutilizaban
   * —a veces sin `WWW-Authenticate`, a veces con `stale="false"`— y las dos
   * ramas de aquí lo leían como «usuario o clave». `curl --digest` entraba
   * porque cada vez hace el intercambio limpio. Ahora:
   *
   *  (b) un `401` a una petición que viajó con el nonce GUARDADO nunca es la
   *      clave: se descarta el nonce y se hace UN intercambio limpio —sin
   *      credencial → `401` con desafío → autenticada—, traiga o no desafío
   *      ese `401`, diga `stale` lo que diga;
   *  (a) sólo el `401` que responde a la autenticación de ESE intercambio es
   *      la credencial (con `stale=true` es un nonce vencido otra vez, no la
   *      clave), y entonces no se insiste: el equipo bloquea la cuenta (d);
   *  · un `401` SIN desafío a la petición sin credencial no es la clave —no
   *    se presentó— y se dice aparte (`sinDesafio`).
   *
   * Aplica igual a órdenes, sondeos y suscripciones: todas pasan por aquí.
   */
  private async conDigest(
    metodo: string,
    ruta: string,
    enviar: () => Promise<Response>,
  ): Promise<ConDigest> {
    // A5 (15-L) · una credencial que el equipo ya rechazó no se vuelve a
    // presentar: ni orden, ni escucha, ni sondeo. Sin red, sin intento fallido.
    const ahora = this.ahora();
    const hace = this.sesion.rechazadaHace(ahora, VENTANA_DE_CREDENCIAL_RECHAZADA_MS);
    if (hace !== null) {
      const segundos = this.sesion.segundosDeBloqueo(ahora);
      throw new CredencialRechazada(
        this.opciones.dispositivoId ?? this.destino,
        hace,
        segundos === null ? null : { segundosParaDesbloquear: segundos },
      );
    }
    let primera = await enviar();
    if (primera.status !== 401)
      return { respuesta: primera, desafioVencido: false, sinDesafio: false };

    if (this.sesion.tieneDesafio) {
      // (b) · viajó con el nonce guardado y el equipo lo rechazó: no vale. Se
      // descarta y se negocia otro desde cero, en ESTE intercambio.
      const stale = interpretarDesafio(primera.headers.get('www-authenticate'))?.stale;
      this.opciones.traza?.registrar(
        'info',
        'el equipo rechazó el nonce guardado: se descarta y se negocia limpio (NO es la clave)',
        {
          ...this.contexto(),
          metodo,
          ruta,
          conDesafio: stale !== undefined,
          stale: stale ?? null,
        },
      );
      this.sesion.descartarDesafio();
      await descartar(primera);
      primera = await enviar();
      if (primera.status !== 401) {
        return { respuesta: primera, desafioVencido: false, sinDesafio: false };
      }
    }

    // Aquí `primera` es el 401 a una petición SIN credencial: el saludo.
    const renegociacion = this.sesion.renegociar(primera.headers.get('www-authenticate'));
    if (renegociacion === null) {
      this.opciones.traza?.registrar(
        'aviso',
        'el equipo contestó 401 SIN desafío Digest a una petición sin credencial: no es la clave',
        { ...this.contexto(), metodo, ruta },
      );
      return { respuesta: primera, desafioVencido: false, sinDesafio: true };
    }
    this.anotarRenegociacion(renegociacion, metodo, ruta);
    await descartar(primera);

    const segunda = await enviar();
    if (segunda.status !== 401)
      return { respuesta: segunda, desafioVencido: false, sinDesafio: false };

    // (a) · 401 limpio → autenticación → 401: la credencial, salvo `stale`.
    const cabecera = segunda.headers.get('www-authenticate');
    const vencido = interpretarDesafio(cabecera)?.stale === true;
    // Se guarda para la PRÓXIMA petición; ésta no se repite.
    this.sesion.renegociar(cabecera);
    if (!vencido) await this.marcarRechazada(segunda, metodo, ruta);
    else {
      this.opciones.traza?.registrar(
        'aviso',
        'el equipo venció el desafío Digest recién negociado: NO es la clave',
        { ...this.contexto(), metodo, ruta },
      );
    }
    return { respuesta: segunda, desafioVencido: vencido, sinDesafio: false };
  }

  /**
   * (d) · UN intento fallido real por credencial. Se lee el cuerpo del `401`
   * (E1-f): si el equipo declara la cuenta bloqueada y por cuánto, la marca
   * dura eso; si no, la ventana de A5.
   */
  private async marcarRechazada(respuesta: Response, metodo: string, ruta: string): Promise<void> {
    const comprobacion = interpretarUserCheck(await leerSinConsumir(respuesta));
    const bloqueoMs =
      comprobacion?.bloqueada === true && comprobacion.segundosParaDesbloquear !== null
        ? comprobacion.segundosParaDesbloquear * 1000
        : null;
    this.sesion.marcarRechazada(this.ahora(), bloqueoMs);
    // (d) · y se olvida el desafío: cuando se vuelva a presentar —pasada la
    // ventana o por «Probar conexión»— será UN intercambio limpio, un solo
    // resumen malo, no una preventiva más una renegociada.
    this.sesion.descartarDesafio();
    this.opciones.traza?.registrar(
      'error',
      comprobacion?.bloqueada === true
        ? 'el equipo declara la cuenta BLOQUEADA: NO se reintenta'
        : 'el equipo rechazó usuario o clave en un intercambio limpio: NO se reintenta',
      {
        ...this.contexto(),
        metodo,
        ruta,
        ...(comprobacion === null
          ? {}
          : {
              bloqueada: comprobacion.bloqueada,
              segundosParaDesbloquear: comprobacion.segundosParaDesbloquear,
              intentosRestantes: comprobacion.intentosRestantes,
            }),
      },
    );
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

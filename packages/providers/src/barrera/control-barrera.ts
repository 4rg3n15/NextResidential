import type { ControlDeBarrera, ResultadoDeAccionamiento } from '@ncr/domain-core';
import { ordenAceptada, ordenInalcanzable, ordenRechazada } from '@ncr/domain-core';
import { SesionDigest, cnonceAleatorio } from './digest';

/**
 * Adaptador real de la barrera vehicular.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PROCEDENCIA DE LA RUTA · leer antes de tocar nada de aquí abajo
 *
 * La ruta y el cuerpo NO vienen de documentación del fabricante. Se capturaron
 * el **15/09/2026** del JavaScript de la propia interfaz del equipo, con el
 * panel de red del navegador, y se reprodujeron después con una petición
 * manual. Equipo `DS-TCG405-E`, firmware `V5.4.0 build 250425`.
 *
 * El módulo es `Parking`. **No es `Traffic` ni `System/IO`**: los dos se
 * probaron contra este mismo aparato y contestaron `notSupport`. Esa suposición
 * por parecido con otra familia costó dos intentos fallidos ese día, y por eso
 * queda escrita aquí: **ninguna ruta de este archivo se deduce por analogía**.
 *
 * Si hace falta otra operación, se captura primero y se escribe después.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Y una consecuencia de KPI-11: el nombre del protocolo, el del módulo, el del
 * campo y el número de canal **solo existen dentro de este archivo**. Lo que
 * sale de aquí es `aceptada`, `rechazada` o `inalcanzable`.
 */

/** Capturado del equipo. Un solo carril en la instalación medida. */
const CANAL = 1;

/** `PUT` verificado el 15/09/2026. Ver la nota de procedencia de arriba. */
const rutaDeBarrera = (canal: number): string => `/ISAPI/Parking/channels/${canal}/barrierGate`;

/**
 * Modos capturados del equipo: los cuatro que su interfaz emite.
 *
 * `lock` y `unlock` son **estado persistente, no pulso** (H-3): con la barrera
 * bloqueada una placa autorizada no abre, y el bloqueo manda sobre cualquier
 * decisión posterior del motor de reglas. Esa diferencia con `open`/`close` es
 * la razón de que el puerto tenga dos métodos y no uno.
 */
type ModoDeControl = 'open' | 'close' | 'lock' | 'unlock';

const cuerpoDeOrden = (modo: ModoDeControl): string =>
  `<?xml version="1.0" encoding="UTF-8"?><BarrierGate><ctrlMode>${modo}</ctrlMode></BarrierGate>`;

/** Confirmación del equipo, verificada: `statusCode 1` con `statusString OK`. */
const CODIGO_DE_ACEPTACION = 1;

const codigoDeRespuesta = (xml: string): number | null => {
  const encontrado = /<statusCode>\s*(-?\d+)\s*<\/statusCode>/i.exec(xml);
  return encontrado === null ? null : Number(encontrado[1]);
};

const textoDeRespuesta = (xml: string): string => {
  const estado = /<statusString>([^<]*)<\/statusString>/i.exec(xml)?.[1]?.trim();
  const sub = /<subStatusCode>([^<]*)<\/subStatusCode>/i.exec(xml)?.[1]?.trim();
  return [estado, sub].filter((t) => t !== undefined && t !== '').join(' · ');
};

export const TIEMPO_LIMITE_POR_OMISION_MS = 3000;

export interface OpcionesDeBarrera {
  readonly host: string;
  readonly puerto?: number;
  readonly usuario: string;
  readonly clave: string;
  readonly tiempoLimiteMs?: number;
  /** Inyectable para que las pruebas corran **sin red y sin equipo**. */
  readonly peticion?: typeof fetch;
  /** Reloj monótono inyectable: la latencia medida tiene que ser determinista. */
  readonly ahora?: () => number;
  readonly generarCnonce?: () => string;
}

export class ControlDeBarreraVehicular implements ControlDeBarrera {
  private readonly sesion: SesionDigest;
  private readonly base: string;
  private readonly tiempoLimiteMs: number;
  private readonly peticion: typeof fetch;
  private readonly ahora: () => number;

  constructor(private readonly opciones: OpcionesDeBarrera) {
    this.sesion = new SesionDigest(
      { usuario: opciones.usuario, clave: opciones.clave },
      opciones.generarCnonce ?? cnonceAleatorio,
    );
    // El equipo medido responde por HTTP con Digest, **no** por HTTPS: forzar
    // TLS aquí lo dejaría inalcanzable. Está anotado en la guía de validación.
    this.base = `http://${opciones.host}:${String(opciones.puerto ?? 80)}`;
    this.tiempoLimiteMs = opciones.tiempoLimiteMs ?? TIEMPO_LIMITE_POR_OMISION_MS;
    this.peticion = opciones.peticion ?? fetch;
    this.ahora = opciones.ahora ?? (() => Date.now());
  }

  async accionar(_dispositivoId: string, abrir: boolean): Promise<ResultadoDeAccionamiento> {
    return this.ordenar(abrir ? 'open' : 'close');
  }

  async fijarBloqueo(
    _dispositivoId: string,
    bloqueado: boolean,
  ): Promise<ResultadoDeAccionamiento> {
    return this.ordenar(bloqueado ? 'lock' : 'unlock');
  }

  /**
   * Un intento, y una renegociación si el equipo contesta `401`.
   *
   * La latencia se mide **alrededor de todo el ciclo**, renegociación incluida:
   * es el tiempo que el operador espera, no el de la última petición.
   */
  private async ordenar(modo: ModoDeControl): Promise<ResultadoDeAccionamiento> {
    const comienzo = this.ahora();
    const transcurrido = (): number => this.ahora() - comienzo;

    try {
      let respuesta = await this.enviar(modo);

      // `401` tardío: el desafío caducó. Se renegocia UNA vez.
      if (respuesta.status === 401) {
        if (!this.sesion.aceptarDesafio(respuesta.headers.get('www-authenticate'))) {
          return ordenRechazada('El equipo no ofreció un desafío de acceso válido', transcurrido());
        }
        respuesta = await this.enviar(modo);
      }

      if (respuesta.status === 401) {
        // Dos rechazos seguidos son credenciales, no caducidad. No se insiste:
        // el equipo bloquea la cuenta tras unos pocos intentos fallidos.
        return ordenRechazada('El equipo rechazó las credenciales', transcurrido());
      }

      const cuerpo = await respuesta.text();
      const codigo = codigoDeRespuesta(cuerpo);

      if (respuesta.ok && codigo === CODIGO_DE_ACEPTACION) {
        /**
         * **H-1 · aceptada NO es abierta.** Observado en el equipo: con la
         * barrera bloqueada, la orden de abrir contesta afirmativamente y el
         * relé no se mueve. Sin la señal de posición de H-2 —que no está
         * cableada— el sistema no puede afirmar que el vehículo pasó, y el
         * tipo del resultado impide afirmarlo.
         */
        return ordenAceptada(transcurrido());
      }

      const detalle = textoDeRespuesta(cuerpo);
      return ordenRechazada(
        detalle === ''
          ? `El equipo no aceptó la orden (HTTP ${String(respuesta.status)})`
          : detalle,
        transcurrido(),
      );
    } catch (error) {
      // Aquí caen el tiempo agotado, el equipo apagado y la red cortada: las
      // tres son «no contesta», y el operador tiene que verlas distintas de un
      // rechazo porque se resuelven llamando al técnico, no desbloqueando.
      const motivo =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
          ? `El equipo no respondió en ${String(this.tiempoLimiteMs)} ms`
          : 'No se pudo alcanzar el equipo';
      return ordenInalcanzable(motivo, transcurrido());
    }
  }

  private async enviar(modo: ModoDeControl): Promise<Response> {
    const uri = rutaDeBarrera(CANAL);
    const autorizacion = this.sesion.autorizacionPara('PUT', uri);
    const cabeceras: Record<string, string> = { 'content-type': 'application/xml' };
    if (autorizacion !== null) cabeceras['authorization'] = autorizacion;

    return this.peticion(`${this.base}${uri}`, {
      method: 'PUT',
      headers: cabeceras,
      body: cuerpoDeOrden(modo),
      signal: AbortSignal.timeout(this.tiempoLimiteMs),
    });
  }

  /** Solo para diagnóstico; no expone la credencial. */
  get destino(): string {
    return `${this.opciones.host}:${String(this.opciones.puerto ?? 80)}`;
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA TERMINAL SIMULADA PREGUNTA, ESPERA Y ACTÚA · ETAPA 15-L (Bloque A)
 *
 * Hasta la 15-L el simulado anotaba el veredicto y nadie lo leía: la prueba
 * de la verificación remota terminaba en «la plataforma contestó», no en «la
 * puerta se abrió». Esto reproduce el modo ARMADO de la guía
 * (`checkChannelType "ISAPI"`):
 *
 *  1. la terminal emite por el flujo que la plataforma mantiene abierto un
 *     evento con `remoteCheck: true` y su `serialNo`;
 *  2. espera, como mucho, `remoteCheckTimeout` segundos;
 *  3. la plataforma contesta con `PUT /ISAPI/AccessControl/remoteCheck` y el
 *     MISMO `serialNo`;
 *  4. `success` dentro del plazo → abre; `failed` → niega; tarde o con una
 *     serie que no pidió → no hace nada, porque ya negó al vencer el plazo.
 *
 * El desenlace se anota por equipo en `desenlacesDeVerificacionPor`: es el
 * oráculo. La respuesta HTTP al `PUT` es «OK» en los cuatro casos
 * (`[SUPUESTO]` S-67: la guía no dice qué contesta el equipo a una serie que
 * no espera), así que la plataforma NO puede saber por la respuesta si la
 * puerta se movió — y la prueba tampoco debe fiarse de ella.
 */

export type DesenlaceDeVerificacion = 'abrio' | 'nego' | 'vencida' | 'serie_desconocida';

export interface VerificacionResuelta {
  readonly serie: string;
  readonly desenlace: DesenlaceDeVerificacion;
  /** Del evento emitido a la respuesta de la plataforma. */
  readonly esperaMs: number | null;
}

/** Lo que cada terminal simulada hizo con cada veredicto, por destino. */
export const desenlacesDeVerificacionPor = new Map<string, VerificacionResuelta[]>();

/** `remoteCheckTimeout` por omisión de la guía: 5 s. */
export const PLAZO_DE_VERIFICACION_MS = 5_000;

export class VerificacionRemotaSimulada {
  private readonly pendientes = new Map<string, number>();
  private readonly resueltas: VerificacionResuelta[] = [];

  constructor(
    destino: string | undefined,
    private readonly plazoMs: number = PLAZO_DE_VERIFICACION_MS,
    private readonly ahora: () => number = () => Date.now(),
  ) {
    if (destino !== undefined) desenlacesDeVerificacionPor.set(destino, this.resueltas);
  }

  /** El equipo acaba de emitir un bloque: si pregunta, empieza a esperar. */
  alEmitir(bloque: Record<string, unknown>): void {
    const acceso = bloque['AccessControllerEvent'] as
      | { readonly remoteCheck?: unknown; readonly serialNo?: unknown }
      | undefined;
    if (acceso?.remoteCheck !== true) return;
    if (typeof acceso.serialNo !== 'number' && typeof acceso.serialNo !== 'string') return;
    this.pendientes.set(String(acceso.serialNo), this.ahora());
  }

  /** La plataforma contesta. Devuelve lo que la terminal HIZO. */
  contestar(cuerpo: string): DesenlaceDeVerificacion {
    const serie = /"serialNo"\s*:\s*"?(\w+)"?/.exec(cuerpo)?.[1] ?? '';
    const exito = /"checkResult"\s*:\s*"success"/.test(cuerpo);
    const emitido = this.pendientes.get(serie);
    this.pendientes.delete(serie);
    const esperaMs = emitido === undefined ? null : this.ahora() - emitido;
    const desenlace: DesenlaceDeVerificacion =
      emitido === undefined
        ? 'serie_desconocida'
        : (esperaMs ?? 0) > this.plazoMs
          ? 'vencida'
          : exito
            ? 'abrio'
            : 'nego';
    this.resueltas.push({ serie, desenlace, esperaMs });
    return desenlace;
  }
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UN FLUJO QUE SE QUEDA ABIERTO, COMO EL DEL EQUIPO
 *
 * `flujo` en el guion entrega una lista y cierra: sirve para el volcado del
 * historial al conectar. Un equipo de verdad deja la conexión abierta y emite
 * cuando alguien pasa. Con `FlujoEnVivo` la prueba conecta la escucha PRIMERO
 * y emite después, cuando ya hay a quién reconocer — que es el orden de sitio.
 */
export class FlujoEnVivo {
  private readonly cola: Record<string, unknown>[] = [];
  private esperando: ((bloque: Record<string, unknown> | null) => void) | null = null;
  private lectores = 0;

  /** Cuántas veces se conectó la plataforma al flujo. */
  get conexiones(): number {
    return this.lectores;
  }

  emitir(bloque: Record<string, unknown>): void {
    const esperando = this.esperando;
    if (esperando === null) {
      this.cola.push(bloque);
      return;
    }
    this.esperando = null;
    esperando(bloque);
  }

  /** El cuerpo de UNA conexión. Una conexión nueva deja sin bloques a la anterior. */
  cuerpo(alEmitir: (bloque: Record<string, unknown>) => void): ReadableStream<Uint8Array> {
    this.lectores += 1;
    const esta = this.lectores;
    const codificador = new TextEncoder();
    const siguiente = (): Promise<Record<string, unknown> | null> => {
      const enCola = this.cola.shift();
      if (enCola !== undefined) return Promise.resolve(enCola);
      this.esperando?.(null);
      return new Promise((resolver) => {
        this.esperando = resolver;
      });
    };
    return {
      getReader: () => ({
        read: async () => {
          if (esta !== this.lectores) return { done: true, value: undefined };
          const bloque = await siguiente();
          if (bloque === null || esta !== this.lectores) return { done: true, value: undefined };
          alEmitir(bloque);
          return { done: false, value: codificador.encode(JSON.stringify(bloque)) };
        },
        cancel: async () => {
          if (esta !== this.lectores) return;
          const esperando = this.esperando;
          this.esperando = null;
          esperando?.(null);
        },
      }),
    } as unknown as ReadableStream<Uint8Array>;
  }
}

import type { Reloj } from '@ncr/domain-core';

/**
 * Generador pseudoaleatorio **con semilla** (xorshift32).
 *
 * `Math.random()` haría que la simulación de fallos fuera irreproducible: una
 * prueba que falla una vez de cada veinte no se puede depurar. Con semilla, la
 * misma semilla produce siempre la misma secuencia de fallos, así que un
 * escenario adverso se reproduce escribiendo un número.
 */
export class Azar {
  private estado: number;

  constructor(semilla = 0x2545f491) {
    // El estado de xorshift no puede ser 0: se quedaría atascado en 0.
    this.estado = semilla >>> 0 || 0x2545f491;
  }

  /** Siguiente valor en [0, 1). */
  siguiente(): number {
    let x = this.estado;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.estado = x >>> 0;
    return this.estado / 0x1_0000_0000;
  }

  /** `true` con probabilidad `p`. `p <= 0` nunca; `p >= 1` siempre. */
  ocurre(p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.siguiente() < p;
  }

  entre(minimo: number, maximo: number): number {
    return minimo + this.siguiente() * (maximo - minimo);
  }
}

/**
 * Perfil de comportamiento del hardware simulado.
 *
 * ADR-03: todo el sistema debe funcionar completo contra el Mock, y eso incluye
 * el hardware **portándose mal**. Un simulador que siempre responde en 5 ms y
 * nunca falla no prueba nada: los caminos de reintento, deduplicación y
 * degradación quedarían sin ejercitar hasta la ETAPA 15, frente al equipo real.
 */
export interface PerfilDeSimulacion {
  /** Rango de latencia simulada, en milisegundos. */
  readonly latenciaMsMin: number;
  readonly latenciaMsMax: number;
  /** Probabilidad de que una operación falle de forma transitoria. */
  readonly probabilidadDeFallo: number;
  /** Probabilidad de que un evento se emita por duplicado (RN-17, CA-22). */
  readonly probabilidadDeDuplicado: number;
  /** Probabilidad de que una lectura salga por debajo del umbral (CU-01, 3a). */
  readonly probabilidadDeBajaConfianza: number;
  /** Intentos totales antes de rendirse. 1 = sin reintento. */
  readonly intentos: number;
}

export const PERFIL_IDEAL: PerfilDeSimulacion = {
  latenciaMsMin: 0,
  latenciaMsMax: 0,
  probabilidadDeFallo: 0,
  probabilidadDeDuplicado: 0,
  probabilidadDeBajaConfianza: 0,
  intentos: 3,
};

/** Perfil por defecto: aproxima lo que hace un equipo real en una red normal. */
export const PERFIL_REALISTA: PerfilDeSimulacion = {
  latenciaMsMin: 40,
  latenciaMsMax: 400,
  probabilidadDeFallo: 0.1,
  probabilidadDeDuplicado: 0.05,
  probabilidadDeBajaConfianza: 0.15,
  intentos: 3,
};

/**
 * El tiempo de la simulación es **virtual**: `esperar` no bloquea, solo suma.
 *
 * Un mock que durmiera de verdad haría que la suite tardara minutos y que la
 * medición de latencia dependiera del planificador del sistema operativo. Aquí
 * la latencia es un número que se acumula y se puede afirmar en una prueba.
 */
export class RelojSimulado implements Reloj {
  private instante: number;

  constructor(inicio: Date = new Date('2026-09-08T14:00:00Z')) {
    this.instante = inicio.getTime();
  }

  ahora(): Date {
    return new Date(this.instante);
  }

  avanzar(ms: number): void {
    this.instante += ms;
  }
}

/** Error transitorio del hardware simulado: lo que un reintento puede resolver. */
export class FalloDeHardwareSimulado extends Error {
  constructor(
    readonly dispositivoId: string,
    readonly operacion: string,
  ) {
    super(`El dispositivo ${dispositivoId} no respondió a ${operacion}`);
    this.name = 'FalloDeHardwareSimulado';
  }
}

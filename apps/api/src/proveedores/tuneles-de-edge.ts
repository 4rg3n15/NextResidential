import type { SesionDeTunel } from '@ncr/providers';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · A1/A3 · LOS TÚNELES VIVOS, UNO POR COPROPIEDAD
 *
 * Vive en memoria del proceso, y por eso la API es UNA instancia (A4,
 * DESPLIEGUE.md §4.4): con dos, el Edge de un conjunto estaría conectado a una
 * y las órdenes de la consola podrían salir por la otra, que no lo tiene.
 *
 * `ocupar` es la única puerta de entrada y es atómica (un solo hilo): si ya hay
 * un túnel abierto para esa copropiedad, el segundo NO entra —ni siquiera el
 * mismo Edge reconectando—: espera a que el latido cierre el anterior (A1).
 * Así un tercero con una credencial robada no desaloja al Edge legítimo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface TunelVivo {
  readonly copropiedadId: string;
  readonly edgeId: string;
  readonly sesion: SesionDeTunel;
  readonly desde: Date;
}

export interface EstadoDelTunel {
  readonly conectado: boolean;
  readonly edgeId: string | null;
  /** Desde cuándo está conectado, o desde cuándo NO lo está (null: nunca se vio). */
  readonly desde: Date | null;
}

type Oyente = (copropiedadId: string, evento: 'conectado' | 'desconectado', edgeId: string) => void;

export class TunelesDeEdge {
  private readonly vivos = new Map<string, TunelVivo>();
  private readonly caidos = new Map<string, { edgeId: string; desde: Date }>();
  private readonly oyentes: Oyente[] = [];

  /** `null` si entró; el túnel que ya ocupa la copropiedad si no. */
  ocupar(tunel: TunelVivo): TunelVivo | null {
    const actual = this.vivos.get(tunel.copropiedadId);
    if (actual !== undefined && actual.sesion.estaAbierta) return actual;
    this.vivos.set(tunel.copropiedadId, tunel);
    this.caidos.delete(tunel.copropiedadId);
    for (const o of this.oyentes) o(tunel.copropiedadId, 'conectado', tunel.edgeId);
    return null;
  }

  /** Lo llama la puerta cuando la sesión se cierra. Sólo libera si es la suya. */
  liberar(tunel: TunelVivo, ahora: Date): void {
    if (this.vivos.get(tunel.copropiedadId) !== tunel) return;
    this.vivos.delete(tunel.copropiedadId);
    this.caidos.set(tunel.copropiedadId, { edgeId: tunel.edgeId, desde: ahora });
    for (const o of this.oyentes) o(tunel.copropiedadId, 'desconectado', tunel.edgeId);
  }

  /** La sesión por la que salen las órdenes de esa copropiedad, o `null`. */
  sesionDe(copropiedadId: string): SesionDeTunel | null {
    const t = this.vivos.get(copropiedadId);
    return t !== undefined && t.sesion.estaAbierta ? t.sesion : null;
  }

  estadoDe(copropiedadId: string): EstadoDelTunel {
    const vivo = this.vivos.get(copropiedadId);
    if (vivo !== undefined && vivo.sesion.estaAbierta) {
      return { conectado: true, edgeId: vivo.edgeId, desde: vivo.desde };
    }
    const caido = this.caidos.get(copropiedadId);
    return { conectado: false, edgeId: caido?.edgeId ?? null, desde: caido?.desde ?? null };
  }

  /** Cuántos Edge hay conectados ahora (A3, `/ready`). */
  get conectados(): number {
    return [...this.vivos.values()].filter((t) => t.sesion.estaAbierta).length;
  }

  alCambiar(oyente: Oyente): void {
    this.oyentes.push(oyente);
  }
}

export const TUNELES_DE_EDGE = Symbol.for('ncr.proveedores.TunelesDeEdge');

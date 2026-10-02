/**
 * 15-Q2 · A2 · los canales binarios de UNA sesión del túnel (el audio).
 *
 * Cada lado numera los que abre con su paridad (la API pares, el Edge impares),
 * así dos aperturas simultáneas nunca chocan. El número del canal que abre el
 * otro lado llega dentro de un pedido; `delOtroLado` lo adopta.
 */
import { ColaDeCanal } from './cola-de-canal';

export interface SalidaDeCanales {
  /** La trama binaria de un canal, hacia el otro lado (sólo con el túnel abierto). */
  readonly trama: (canal: number, carga: Uint8Array) => void;
  /** El aviso de cierre de un canal, hacia el otro lado. */
  readonly cierre: (canal: number, motivo: string) => void;
  readonly abierta: () => boolean;
}

export class CanalesDelTunel {
  private readonly vivos = new Map<number, ColaDeCanal>();
  private siguiente: number;

  constructor(
    paridad: 'par' | 'impar',
    private readonly salida: SalidaDeCanales,
  ) {
    this.siguiente = paridad === 'impar' ? 1 : 2;
  }

  /** Un canal nuevo, numerado con la paridad de este lado. */
  abrir(): ColaDeCanal {
    const id = this.siguiente;
    this.siguiente += 2;
    return this.delOtroLado(id);
  }

  /** El canal que abrió el OTRO lado (su número llegó en un pedido). */
  delOtroLado(id: number): ColaDeCanal {
    const existente = this.vivos.get(id);
    if (existente !== undefined) return existente;
    const cola = new ColaDeCanal(
      id,
      (carga) => {
        if (this.salida.abierta()) this.salida.trama(id, carga);
      },
      (motivo) => {
        this.vivos.delete(id);
        if (this.salida.abierta()) this.salida.cierre(id, motivo);
      },
    );
    this.vivos.set(id, cola);
    if (!this.salida.abierta()) cola.terminar('túnel cerrado');
    return cola;
  }

  /** Bytes que llegaron para un canal. Uno que nadie abrió se ignora. */
  entregar(id: number, carga: Uint8Array): void {
    this.vivos.get(id)?.entregar(carga);
  }

  /** El otro lado cerró un canal (`id`), o el túnel entero cerró (sin `id`). */
  terminar(motivo: string, id?: number): void {
    const colas = id === undefined ? [...this.vivos.values()] : [this.vivos.get(id)];
    for (const cola of colas) cola?.terminar(motivo);
    if (id === undefined) this.vivos.clear();
    else this.vivos.delete(id);
  }
}

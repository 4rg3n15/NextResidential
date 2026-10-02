/**
 * 15-Q2 · un canal binario del túnel: lo que llega se lee como `AsyncIterable`
 * (la misma forma que `recibirAudio` del puerto), y lo que se envía sale como
 * trama. Cerrar desde cualquiera de los dos lados termina la lectura.
 *
 * La cola tiene tope (`MAXIMO_EN_COLA`): si nadie lee —una pestaña colgada—,
 * se descarta lo más viejo. Para audio en vivo, lo viejo ya no sirve.
 */
const MAXIMO_EN_COLA = 256;

export class ColaDeCanal implements AsyncIterable<Uint8Array> {
  private readonly cola: Uint8Array[] = [];
  private esperando: ((r: IteratorResult<Uint8Array>) => void) | null = null;
  private terminado = false;
  private motivo = '';

  constructor(
    readonly id: number,
    private readonly salida: (carga: Uint8Array) => void,
    private readonly alCerrarLocal: (motivo: string) => void,
  ) {}

  get cerrado(): boolean {
    return this.terminado;
  }

  get motivoDeCierre(): string {
    return this.motivo;
  }

  enviar(carga: Uint8Array): void {
    if (!this.terminado) this.salida(carga);
  }

  /** Cierre pedido por ESTE lado: avisa al otro. */
  cerrar(motivo: string): void {
    if (this.terminado) return;
    this.terminar(motivo);
    this.alCerrarLocal(motivo);
  }

  /** Lo que llegó del otro lado. */
  entregar(carga: Uint8Array): void {
    if (this.terminado) return;
    if (this.esperando !== null) {
      const esperando = this.esperando;
      this.esperando = null;
      esperando({ value: carga, done: false });
      return;
    }
    this.cola.push(carga);
    if (this.cola.length > MAXIMO_EN_COLA) this.cola.shift();
  }

  /** Fin de la lectura (cierre del otro lado o del túnel). */
  terminar(motivo: string): void {
    if (this.terminado) return;
    this.terminado = true;
    this.motivo = motivo;
    const esperando = this.esperando;
    this.esperando = null;
    esperando?.({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
    return {
      next: () => {
        const siguiente = this.cola.shift();
        if (siguiente !== undefined) return Promise.resolve({ value: siguiente, done: false });
        if (this.terminado) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolver) => {
          this.esperando = resolver;
        });
      },
      return: () => {
        this.cerrar('el lector dejó de leer');
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}

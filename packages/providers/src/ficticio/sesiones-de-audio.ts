/**
 * C6 (15-M) · LAS SESIONES DE AUDIO DEL PROVEEDOR FICTICIO, UNA POR VIDEOPORTERO
 *
 * Era un único `enSesion` en el proveedor: el segundo videoportero pisaba al
 * primero. Aquí vive el conjunto de sesiones abiertas y la cola de audio de
 * cada una; el proveedor sólo decide cuándo abrir y cerrar. Los métodos del
 * puerto sin dispositivo valen con UNA sesión abierta y se niegan con varias.
 */
export class SesionesDeAudioFicticias {
  private readonly abiertas = new Set<string>();
  private readonly audio = new Map<string, Uint8Array[]>();

  abrir(dispositivoId: string): void {
    this.abiertas.add(dispositivoId);
  }

  /** `true` si había sesión que cerrar. */
  cerrar(dispositivoId: string): boolean {
    this.audio.delete(dispositivoId);
    return this.abiertas.delete(dispositivoId);
  }

  tiene(dispositivoId: string): boolean {
    return this.abiertas.has(dispositivoId);
  }

  todas(): readonly string[] {
    return [...this.abiertas];
  }

  enviar(dispositivoId: string, fragmento: Uint8Array): void {
    this.exigir(dispositivoId);
    const cola = this.audio.get(dispositivoId) ?? [];
    cola.push(fragmento);
    this.audio.set(dispositivoId, cola);
  }

  recibir(dispositivoId: string): Uint8Array[] {
    this.exigir(dispositivoId);
    const cola = this.audio.get(dispositivoId) ?? [];
    return cola.splice(0, cola.length);
  }

  /** La única sesión abierta, para el puerto sin dispositivo. Varias = ambiguo. */
  unica(): string {
    const [primera, ...otras] = this.abiertas;
    if (primera === undefined) throw new Error('No hay ninguna sesión de audio abierta');
    if (otras.length > 0) {
      throw new Error(
        `Hay ${String(this.abiertas.size)} sesiones de audio abiertas: indique el dispositivo`,
      );
    }
    return primera;
  }

  private exigir(dispositivoId: string): void {
    if (!this.abiertas.has(dispositivoId)) {
      throw new Error(`No hay ninguna sesión de audio abierta contra el equipo ${dispositivoId}`);
    }
  }
}

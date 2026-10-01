/**
 * `Transfer-Encoding: chunked`, decodificado en flujo. Lo usan la bajada cruda
 * del audio —por si el equipo contesta así— y el videoportero simulado, que
 * tiene que reconocer una subida trozada para poder decir que llegó así.
 */
export class DecodificadorTrozado {
  private pendiente: Buffer = Buffer.alloc(0);
  private resto = 0;
  private terminado = false;

  constructor(private readonly entregar: (bytes: Buffer) => void) {}

  get fin(): boolean {
    return this.terminado;
  }

  alimentar(datos: Uint8Array): void {
    if (this.terminado) return;
    this.pendiente = Buffer.concat([this.pendiente, datos]);
    for (;;) {
      if (this.resto > 0) {
        const tomado = this.pendiente.subarray(0, this.resto);
        if (tomado.length === 0) return;
        this.entregar(tomado);
        this.resto -= tomado.length;
        this.pendiente = this.pendiente.subarray(tomado.length);
        continue;
      }
      const fin = this.pendiente.indexOf('\r\n');
      if (fin < 0) return;
      const linea = this.pendiente.subarray(0, fin).toString('latin1').split(';')[0]?.trim() ?? '';
      this.pendiente = this.pendiente.subarray(fin + 2);
      if (linea === '') continue;
      const largo = Number.parseInt(linea, 16);
      if (!Number.isFinite(largo) || largo <= 0) {
        this.terminado = true;
        return;
      }
      this.resto = largo;
    }
  }
}

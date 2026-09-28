/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F2 (corrección de la 15-L) · DE QUIÉN ES CADA EQUIPO, RECORDADO UN RATO
 *
 * Cada rostro que una terminal reconoce pregunta primero de qué copropiedad es
 * el equipo (R1). Dentro del plazo de la terminal esa consulta a la base se
 * repite en cada reconocimiento; aquí se recuerda 30 s (`[SUPUESTO]` S-96) y
 * se OLVIDA en el acto cuando la consola edita, da de baja o reactiva el
 * equipo —el mismo `OLVIDO_DE_EQUIPO` que ya soltaba al proveedor (C1)—.
 *
 * Sólo se recuerda lo encontrado: un equipo recién dado de alta tiene que
 * publicar ya, y un «no es de nadie» recordado lo dejaría fuera medio minuto.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface FuenteDeCopropiedadDeEquipo {
  copropiedadDe(dispositivoId: string): Promise<string | null>;
}

export class CopropiedadDeEquipoEnCache implements FuenteDeCopropiedadDeEquipo {
  private readonly recordadas = new Map<
    string,
    { readonly copropiedadId: string; readonly hasta: number }
  >();

  constructor(
    private readonly fuente: FuenteDeCopropiedadDeEquipo,
    private readonly ahora: () => number,
    private readonly vidaMs = 30_000,
  ) {}

  async copropiedadDe(dispositivoId: string): Promise<string | null> {
    const recordada = this.recordadas.get(dispositivoId);
    if (recordada !== undefined && recordada.hasta > this.ahora()) return recordada.copropiedadId;
    const copropiedadId = await this.fuente.copropiedadDe(dispositivoId);
    if (copropiedadId === null) {
      this.recordadas.delete(dispositivoId);
      return null;
    }
    this.recordadas.set(dispositivoId, { copropiedadId, hasta: this.ahora() + this.vidaMs });
    return copropiedadId;
  }

  olvidar(dispositivoId: string): void {
    this.recordadas.delete(dispositivoId);
  }
}

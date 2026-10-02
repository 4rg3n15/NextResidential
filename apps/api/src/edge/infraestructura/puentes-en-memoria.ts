import type { FichaDeEdge, RepositorioDePuentes, ResultadoDeMarca } from '../aplicacion/puentes';

/**
 * Sin base: ningún Edge es puente (todo va directo, R1). Las pruebas que
 * necesitan uno lo dan de alta con `alta` y lo marcan como lo haría la consola,
 * con la misma regla del índice único: un puente por copropiedad.
 */
export class PuentesEnMemoria implements RepositorioDePuentes {
  private readonly fichas = new Map<string, FichaDeEdge & { copropiedadId: string }>();

  alta(copropiedadId: string, id: string, nombre: string): void {
    this.fichas.set(id, {
      id,
      copropiedadId,
      nombre,
      puente: false,
      puenteDesde: null,
      ultimoLatido: null,
      versionDeReglas: 0,
    });
  }

  async esPuente(edgeId: string): Promise<boolean> {
    return this.fichas.get(edgeId)?.puente === true;
  }

  async deCopropiedad(_ctx: unknown, copropiedadId: string): Promise<readonly FichaDeEdge[]> {
    return [...this.fichas.values()].filter((f) => f.copropiedadId === copropiedadId);
  }

  async marcar(
    _ctx: unknown,
    copropiedadId: string,
    edgeId: string,
    puente: boolean,
    ahora: Date,
  ): Promise<ResultadoDeMarca> {
    const ficha = this.fichas.get(edgeId);
    if (ficha === undefined || ficha.copropiedadId !== copropiedadId) return 'no_encontrado';
    const otro = [...this.fichas.values()].find(
      (f) => f.copropiedadId === copropiedadId && f.puente && f.id !== edgeId,
    );
    if (puente && otro !== undefined) return 'otro_puente';
    this.fichas.set(edgeId, { ...ficha, puente, puenteDesde: puente ? ahora : null });
    return 'marcado';
  }
}

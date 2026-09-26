import { randomUUID } from 'node:crypto';
import type {
  BitacoraDeIdentidad,
  ConsultaDeHechos,
  HechoDeIdentidad,
  HechoRegistrado,
} from './puerto';

/** Doble de la suite y del ensayo sin base: sólo añade, nunca edita ni borra. */
export class BitacoraDeIdentidadEnMemoria implements BitacoraDeIdentidad {
  private readonly hechos: HechoRegistrado[] = [];

  async anotar(hecho: HechoDeIdentidad): Promise<void> {
    this.hechos.push(Object.freeze({ ...hecho, id: randomUUID() }));
  }

  async consultar(q: ConsultaDeHechos): Promise<readonly HechoRegistrado[]> {
    return this.hechos
      .filter(
        (h) =>
          h.copropiedadId === q.copropiedadId &&
          h.ocurridoEn.getTime() >= q.desde.getTime() &&
          h.ocurridoEn.getTime() < q.hasta.getTime() &&
          (q.tipos === undefined || q.tipos.includes(h.tipo)),
      )
      .sort((a, b) => b.ocurridoEn.getTime() - a.ocurridoEn.getTime())
      .slice(0, q.limite);
  }
}
